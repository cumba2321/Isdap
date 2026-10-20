#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>
#include "RTC.h"
#include "WiFiS3.h"
#include "WiFiSSLClient.h"
#include <EEPROM.h>
#include "Secrets.h"

// --- Pin Definitions ---
#define TEMP_PIN 2
#define PH_PIN A0
#define DO_PIN A1
#define EC_PIN A2
#define TDS_PIN A3
#define TURBIDITY_PIN A4

// --- Network & Firebase Configuration ---
const char* firebaseHost = "isdapp-251fc-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* firebaseAuthHost = "identitytoolkit.googleapis.com";
const char* firebaseTokenHost = "securetoken.googleapis.com";

String firebaseIdToken = "";
String firebaseRefreshToken = "";
unsigned long lastTokenRefresh = 0;
const unsigned long tokenRefreshInterval = 50UL * 60UL * 1000UL;
String ssid = "";
String pass = "";
bool portalActive = false;

WiFiServer server(80);
WiFiSSLClient sslClient;
unsigned long lastUploadTime = 0;
const unsigned long uploadInterval = 5000;
unsigned long lastSerialLogUpload = 0;
const unsigned long serialLogUploadInterval = 10000;
unsigned long lastDeviceConfigFetch = 0;
const unsigned long deviceConfigFetchInterval = 60000;
const uint8_t maxSerialLogEntries = 10;
struct SerialLogEntry {
  uint32_t sequence;
  unsigned long uptimeMs;
  String message;
};
SerialLogEntry serialLogEntries[maxSerialLogEntries];
uint8_t serialLogCount = 0;
uint32_t serialLogSequence = 0;
String serialLogBootId = "";
void logSerial(const String& message);

// EEPROM layout: SSID (max 32 chars + null) at 0, password (max 63 chars + null) at 64
const int ssidAddress = 0;
const int passAddress = 64;
const int ssidMaxLen = 32;
const int passMaxLen = 63;

// --- Sensor Objects & Variables ---
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

float smoothedCalTempC = 25.0, tempCalibrationOffset = -0.56;
float phSlope = 55.0, phIntercept = -99.13, smoothedPHVoltage = 0.0;
float smoothedDOVoltage = 0.0, calibratedV_saturation = 969.0;
float ecV1 = 0.275, ecC1 = 0.0, ecV2 = 2.30, ecC2 = 13.61, smoothedECVoltage = 0.0;
float tdsCalibrationFactor = 1.045, smoothedTDSVoltage = 0.0;
float smoothedTurbidityVoltage = 0.0;

bool isTempFirstRead = true, isPHFirstRead = true, isDOFirstRead = true;
bool isECFirstRead = true, isTDSFirstRead = true, isTurbidityFirstRead = true;

float calculatedpH = 7.0, calculatedDO = 6.0, calculatedEC = 0.0, calculatedTDS = 0.0, calculatedNTU = 0.0;

bool isTempCritical = false;
bool isPHCritical = false;
bool isDOCritical = false;
bool isECCritical = false;
bool isTDSCritical = false;
bool isTurbidityCritical = false;
bool isTempWarning = false;
bool isPHWarning = false;
bool isDOWarning = false;
bool isECWarning = false;
bool isTDSWarning = false;
bool isTurbidityWarning = false;

String alertPhoneNumber = "";
bool smsNotificationsEnabled = false;
bool smsCriticalEnabled = false;
bool smsWarningEnabled = false;

const uint16_t DO_Table[41] = {
    14460, 14220, 13820, 13440, 13090, 12740, 12420, 12110, 11810, 11530,
    11260, 11010, 10770, 10530, 10300, 10080, 9860,  9660,  9460,  9270,
    9080,  8900,  8730,  8570,  8410,  8250,  8110,  7960,  7820,  7690,
    7560,  7430,  7300,  7180,  7070,  6950,  6840,  6730,  6630,  6530, 6410
};

// ---------------------------------------------------------------
// EEPROM Read/Write Helper Functions
// ---------------------------------------------------------------
void writeEEPROM(int startAddr, const String& data, int maxLen) {
  int len = data.length();
  if (len > maxLen) len = maxLen;
  for (int i = 0; i < len; i++) {
    EEPROM.write(startAddr + i, data[i]);
  }
  EEPROM.write(startAddr + len, '\0');
}

String readEEPROM(int startAddr, int maxLen) {
  String data = "";
  for (int i = 0; i < maxLen; i++) {
    char c = EEPROM.read(startAddr + i);
    if (c == '\0' || (uint8_t)c == 255) break;
    data += c;
  }
  return data;
}

// ---------------------------------------------------------------
// URL decoding (browser percent-encodes form values sent via GET)
// ---------------------------------------------------------------
String urlDecode(const String& in) {
  String out = "";
  for (unsigned int i = 0; i < in.length(); i++) {
    char c = in[i];
    if (c == '+') {
      out += ' ';
    } else if (c == '%' && i + 2 < in.length()) {
      out += (char)strtol(in.substring(i + 1, i + 3).c_str(), NULL, 16);
      i += 2;
    } else {
      out += c;
    }
  }
  return out;
}

// ---------------------------------------------------------------
// Wi-Fi connection helper with retries
// ---------------------------------------------------------------
bool connectWiFi(const String& s, const String& p) {
  for (int attempt = 1; attempt <= 3; attempt++) {
    logSerial("[WiFi] Attempt " + String(attempt) + " to '" + s + "' (pass len " + String(p.length()) + ")");
    WiFi.disconnect();
    WiFi.begin(s.c_str(), p.c_str());

    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
      delay(250);
    }

    if (WiFi.status() == WL_CONNECTED) {
      // Wait for DHCP to hand out an IP
      t = millis();
      while (WiFi.localIP() == IPAddress(0, 0, 0, 0) && millis() - t < 5000) {
        delay(100);
      }
      logSerial("[WiFi] Connected, IP: " + WiFi.localIP().toString());
      return true;
    }
    logSerial("[WiFi] Failed, status = " + String(WiFi.status()));
  }
  return false;
}

// ---------------------------------------------------------------
// JSON / HTTP helpers
// ---------------------------------------------------------------
String jsonEscape(const String& value) {
  String escaped = "";
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '\\' || c == '"') escaped += '\\';
    if (c == '\n') {
      escaped += "\\n";
    } else if (c == '\r') {
      escaped += "\\r";
    } else {
      escaped += c;
    }
  }
  return escaped;
}

void logSerial(const String& message) {
  Serial.println(message);

  String storedMessage = message;
  if (storedMessage.length() > 180) storedMessage = storedMessage.substring(0, 180);
  if (serialLogCount == maxSerialLogEntries) {
    for (uint8_t i = 1; i < maxSerialLogEntries; i++) {
      serialLogEntries[i - 1] = serialLogEntries[i];
    }
    serialLogCount--;
  }

  SerialLogEntry& entry = serialLogEntries[serialLogCount++];
  entry.sequence = ++serialLogSequence;
  entry.uptimeMs = millis();
  entry.message = storedMessage;
}

String serialLogJson() {
  String json = "{\"bootId\":\"" + jsonEscape(serialLogBootId) + "\",\"entries\":[";
  for (uint8_t i = 0; i < serialLogCount; i++) {
    if (i > 0) json += ",";
    const SerialLogEntry& entry = serialLogEntries[i];
    json += "{\"id\":\"" + jsonEscape(serialLogBootId) + "-" + String(entry.sequence) +
      "\",\"uptimeMs\":" + String(entry.uptimeMs) +
      ",\"message\":\"" + jsonEscape(entry.message) + "\"}";
  }
  json += "]}";
  return json;
}

String readJsonString(const String& json, const char* key) {
  String marker = String("\"") + key + "\"";
  int keyStart = json.indexOf(marker);
  if (keyStart < 0) return "";
  int start = json.indexOf(':', keyStart + marker.length());
  if (start < 0) return "";
  start++;
  while (start < json.length() && (json[start] == ' ' || json[start] == '\t')) start++;
  if (start >= json.length() || json[start] != '"') return "";
  start++;

  String value = "";
  bool escaped = false;
  for (int i = start; i < json.length(); i++) {
    char c = json[i];
    if (escaped) {
      value += c;
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      return value;
    } else {
      value += c;
    }
  }
  return "";
}

bool readJsonBool(const String& json, const char* key) {
  String marker = String("\"") + key + "\"";
  int keyStart = json.indexOf(marker);
  if (keyStart < 0) return false;
  int valueStart = json.indexOf(':', keyStart + marker.length());
  if (valueStart < 0) return false;
  valueStart++;
  while (valueStart < json.length() && (json[valueStart] == ' ' || json[valueStart] == '\t')) valueStart++;
  return json.substring(valueStart, valueStart + 4) == "true";
}

void applySerialLogClearMarkers(String markers) {
  int markerStart = 0;
  while (markerStart < markers.length()) {
    int markerEnd = markers.indexOf(',', markerStart);
    if (markerEnd < 0) markerEnd = markers.length();
    String marker = markers.substring(markerStart, markerEnd);
    int separator = marker.lastIndexOf(':');
    if (separator > 0 && marker.substring(0, separator) == serialLogBootId) {
      uint32_t clearThrough = (uint32_t)marker.substring(separator + 1).toInt();
      uint8_t retained = 0;
      for (uint8_t i = 0; i < serialLogCount; i++) {
        if (serialLogEntries[i].sequence > clearThrough) {
          if (retained != i) serialLogEntries[retained] = serialLogEntries[i];
          retained++;
        }
      }
      serialLogCount = retained;
    }
    markerStart = markerEnd + 1;
  }
}

bool readHttpResponse(WiFiSSLClient& client, String& statusLine, String& body) {
  unsigned long startedAt = millis();
  statusLine = client.readStringUntil('\n');
  statusLine.trim();
  bool chunked = false;

  while (client.connected() || client.available()) {
    if (millis() - startedAt > 15000) {
      client.stop();
      return false;
    }
    if (!client.available()) {
      delay(10);
      continue;
    }
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) break;
    line.toLowerCase();
    if (line.indexOf("transfer-encoding: chunked") >= 0) chunked = true;
  }

  if (chunked) {
    while (client.connected() || client.available()) {
      String sizeLine = client.readStringUntil('\n');
      sizeLine.trim();
      int extension = sizeLine.indexOf(';');
      if (extension >= 0) sizeLine = sizeLine.substring(0, extension);
      long chunkSize = strtol(sizeLine.c_str(), NULL, 16);
      if (chunkSize <= 0) {
        client.readStringUntil('\n');
        break;
      }
      for (long i = 0; i < chunkSize; i++) {
        unsigned long waitStart = millis();
        while (!client.available() && client.connected() && millis() - waitStart < 10000) delay(5);
        if (!client.available()) {
          client.stop();
          return false;
        }
        body += (char)client.read();
      }
      client.readStringUntil('\n');
      if (body.length() > 4096) {
        client.stop();
        return false;
      }
    }
  } else {
    while (client.connected() || client.available()) {
      if (millis() - startedAt > 15000) {
        client.stop();
        return false;
      }
      while (client.available()) {
        body += (char)client.read();
        if (body.length() > 4096) {
          client.stop();
          return false;
        }
      }
      if (client.connected()) delay(5);
    }
  }

  client.stop();
  return statusLine.indexOf("200") >= 0;
}

// ---------------------------------------------------------------
// Firebase Auth
// ---------------------------------------------------------------
bool sendFirebaseAuthRequest(const char* host, const String& requestPath, const String& requestBody, String& responseBody) {
  WiFiSSLClient authClient;
  if (!authClient.connect(host, 443)) {
    logSerial("[Firebase Auth] HTTPS connection failed.");
    return false;
  }

  authClient.print("POST ");
  authClient.print(requestPath);
  authClient.println(" HTTP/1.1");
  authClient.print("Host: ");
  authClient.println(host);
  authClient.println("Connection: close");
  authClient.println("Content-Type: application/json");
  authClient.print("Content-Length: ");
  authClient.println(requestBody.length());
  authClient.println();
  authClient.print(requestBody);

  String statusLine;
  bool success = readHttpResponse(authClient, statusLine, responseBody);
  if (!success) {
    logSerial("[Firebase Auth] Authentication request was rejected or timed out.");
  }
  return success;
}

bool signInDevice() {
  String requestBody = String("{\"email\":\"") + jsonEscape(DEVICE_EMAIL) +
    "\",\"password\":\"" + jsonEscape(DEVICE_PASSWORD) +
    "\",\"returnSecureToken\":true}";
  String responseBody;
  String path = String("/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
  if (!sendFirebaseAuthRequest(firebaseAuthHost, path, requestBody, responseBody)) return false;

  firebaseIdToken = readJsonString(responseBody, "idToken");
  firebaseRefreshToken = readJsonString(responseBody, "refreshToken");
  if (firebaseIdToken.length() == 0 || firebaseRefreshToken.length() == 0) {
    logSerial("[Firebase Auth] Token response was incomplete.");
    return false;
  }
  lastTokenRefresh = millis();
  logSerial("[Firebase Auth] Device account signed in.");
  return true;
}

bool refreshDeviceToken() {
  if (firebaseRefreshToken.length() == 0) return signInDevice();

  String requestBody = String("{\"grant_type\":\"refresh_token\",\"refresh_token\":\"") +
    jsonEscape(firebaseRefreshToken) + "\"}";
  String responseBody;
  String path = String("/v1/token?key=") + FIREBASE_API_KEY;
  if (!sendFirebaseAuthRequest(firebaseTokenHost, path, requestBody, responseBody)) return signInDevice();

  String newIdToken = readJsonString(responseBody, "id_token");
  String newRefreshToken = readJsonString(responseBody, "refresh_token");
  if (newIdToken.length() == 0 || newRefreshToken.length() == 0) return signInDevice();

  firebaseIdToken = newIdToken;
  firebaseRefreshToken = newRefreshToken;
  lastTokenRefresh = millis();
  logSerial("[Firebase Auth] Device token refreshed.");
  return true;
}

bool ensureDeviceToken() {
  if (firebaseIdToken.length() == 0) return signInDevice();
  if (millis() - lastTokenRefresh >= tokenRefreshInterval) return refreshDeviceToken();
  return true;
}

String normalizeSmsPhoneNumber(String phoneNumber) {
  phoneNumber.trim();
  if (phoneNumber.length() == 0) return "";

  String digits = "";
  for (unsigned int i = 0; i < phoneNumber.length(); i++) {
    if (isDigit(phoneNumber[i])) digits += phoneNumber[i];
  }

  if (phoneNumber.startsWith("+")) return String("+") + digits;
  if (digits.startsWith("00")) return String("+") + digits.substring(2);
  if (digits.startsWith("63")) return String("+") + digits;
  if (digits.startsWith("09") && digits.length() == 11) {
    return String("+63") + digits.substring(1);
  }
  if (digits.startsWith("9") && digits.length() == 10) {
    return String("+63") + digits;
  }
  return phoneNumber;
}

void fetchPhoneNumberFromFirebase() {
  if (!ensureDeviceToken()) return;
  lastDeviceConfigFetch = millis();
  if (!sslClient.connect(firebaseHost, 443)) {
    logSerial("[Firebase] Could not fetch device settings.");
    return;
  }

  String path = String("/deviceConfig/") + DEVICE_ID + ".json?auth=" + firebaseIdToken;
  sslClient.print("GET ");
  sslClient.print(path);
  sslClient.println(" HTTP/1.1");
  sslClient.print("Host: ");
  sslClient.println(firebaseHost);
  sslClient.println("Connection: close");
  sslClient.println();

  String statusLine;
  String responseBody;
  if (readHttpResponse(sslClient, statusLine, responseBody)) {
    alertPhoneNumber = normalizeSmsPhoneNumber(readJsonString(responseBody, "alertNumber"));
    smsNotificationsEnabled = readJsonBool(responseBody, "smsEnabled");
    smsCriticalEnabled = readJsonBool(responseBody, "smsCritical");
    smsWarningEnabled = readJsonBool(responseBody, "smsWarning");
    applySerialLogClearMarkers(readJsonString(responseBody, "serialLogClear"));
    logSerial("[Firebase] SMS settings refreshed.");
  } else {
    logSerial("[Firebase] Could not read device SMS settings.");
  }
}

// ---------------------------------------------------------------
// Setup
// ---------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial1.begin(115200);
  tempSensor.begin();
  analogReadResolution(10);
  RTC.begin();
  serialLogBootId = String(micros()) + "-" + String(analogRead(PH_PIN)) + "-" + String(analogRead(EC_PIN));

  if (WiFi.status() == WL_NO_MODULE) {
    while (true);
  }

  ssid = readEEPROM(ssidAddress, ssidMaxLen);
  pass = readEEPROM(passAddress, passMaxLen);

  if (ssid.length() > 0) {
    connectWiFi(ssid, pass);
  }

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.beginAP("IsdaApp_Setup");
    server.begin();
    portalActive = true;
    logSerial("[MODE: SETUP] Access Point started: IsdaApp_Setup");
  } else {
    portalActive = false;
    logSerial("[MODE: CLOUD] Connected to Wi-Fi successfully.");
    if (signInDevice()) fetchPhoneNumberFromFirebase();
  }
}

// ---------------------------------------------------------------
// Setup portal (Access Point mode)
// ---------------------------------------------------------------
void handlePortal() {
  WiFiClient client = server.available();
  if (client) {
    String requestString = "";
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        if (requestString.length() < 400) requestString += c;
        if (c == '\n') {
          if (requestString.indexOf("GET /save?") != -1) {
            int sStart = requestString.indexOf("?s=") + 3;
            int sEnd = requestString.indexOf("&p=");
            int pStart = sEnd + 3;
            int pEnd = requestString.indexOf(" HTTP/");

            bool saved = false;
            if (sStart > 2 && sEnd > sStart && pEnd > pStart) {
              String newSSID = urlDecode(requestString.substring(sStart, sEnd));
              String newPass = urlDecode(requestString.substring(pStart, pEnd));

              writeEEPROM(ssidAddress, newSSID, ssidMaxLen);
              writeEEPROM(passAddress, newPass, passMaxLen);
              saved = true;

              logSerial("Credentials saved via Portal! New SSID: " + newSSID +
                             " (pass len " + String(newPass.length()) + ")");
            } else {
              logSerial("[Portal] Could not parse credentials (request too long or malformed).");
            }

            client.println("HTTP/1.1 200 OK");
            client.println("Content-Type: text/html");
            client.println("Connection: close");
            client.println();
            client.println("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body style='font-family:sans-serif; padding:20px;'>");
            if (saved) {
              client.println("<h2>Configuration Saved!</h2>");
              client.println("<p>The device is restarting to connect to your network.</p>");
            } else {
              client.println("<h2>Save Failed</h2>");
              client.println("<p>Credentials were too long or invalid. Go back and try again.</p>");
            }
            client.println("</body></html>");
            client.flush();
            client.stop();

            if (saved) {
              delay(2000);
              NVIC_SystemReset();
            }
            return;
          }
          else if (requestString.indexOf("GET / ") != -1 || requestString.indexOf("GET /favicon.ico") == -1) {
            client.println("HTTP/1.1 200 OK");
            client.println("Content-Type: text/html");
            client.println("Connection: close");
            client.println();
            client.println("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head>");
            client.println("<body style='font-family:sans-serif; padding:20px;'>");
            client.println("<h2>IsdaApp Setup Portal</h2>");
            client.println("<form action='/save' method='GET'>");
            client.println("<label>WiFi SSID:</label><br><input type='text' name='s' style='width:100%; padding:10px; margin:5px 0;'><br><br>");
            client.println("<label>WiFi Password:</label><br><input type='password' name='p' style='width:100%; padding:10px; margin:5px 0;'><br><br>");
            client.println("<input type='submit' value='Save & Connect' style='width:100%; background:#0ea5e9; color:white; border:none; padding:12px; font-weight:bold;'>");
            client.println("</form></body></html>");
            client.flush();
            break;
          }
        }
      }
    }
    client.stop();
  }
}

// ---------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------
void readSensors() {
  tempSensor.requestTemperatures();
  float rawTempC = tempSensor.getTempCByIndex(0);
  if (rawTempC > -127.0 && rawTempC != 85.0) {
    smoothedCalTempC = isTempFirstRead ? rawTempC + tempCalibrationOffset : ((rawTempC + tempCalibrationOffset) * 0.1) + (smoothedCalTempC * 0.9);
    isTempFirstRead = false;
  }

  float rawPHVoltage = analogRead(PH_PIN) * (5.0 / 1023.0);
  smoothedPHVoltage = isPHFirstRead ? rawPHVoltage : (rawPHVoltage * 0.1) + (smoothedPHVoltage * 0.9);
  isPHFirstRead = false;
  calculatedpH = (smoothedPHVoltage * phSlope) + phIntercept;

  float rawDOVoltage = analogRead(DO_PIN) * (5.0 / 1023.0) * 1000.0;
  smoothedDOVoltage = isDOFirstRead ? rawDOVoltage : (rawDOVoltage * 0.1) + (smoothedDOVoltage * 0.9);
  isDOFirstRead = false;
  int tempIndex = constrain((int)smoothedCalTempC, 0, 40);
  calculatedDO = (smoothedDOVoltage / calibratedV_saturation) * ((float)DO_Table[tempIndex] / 1000.0);

  float rawECVoltage = analogRead(EC_PIN) * (5.0 / 1023.0);
  smoothedECVoltage = isECFirstRead ? rawECVoltage : (rawECVoltage * 0.1) + (smoothedECVoltage * 0.9);
  isECFirstRead = false;
  float ecSlope = (ecC2 - ecC1) / (ecV2 - ecV1);
  calculatedEC = max(0.0f, (smoothedECVoltage * ecSlope) + (ecC1 - (ecSlope * ecV1)));

  float rawTDSVoltage = analogRead(TDS_PIN) * (5.0 / 1023.0);
  smoothedTDSVoltage = isTDSFirstRead ? rawTDSVoltage : (rawTDSVoltage * 0.1) + (smoothedTDSVoltage * 0.9);
  isTDSFirstRead = false;
  float tempComp = 1.0 + 0.02 * (smoothedCalTempC - 25.0);
  float tdsCompVolts = smoothedTDSVoltage / tempComp;
  calculatedTDS = (133.42 * pow(tdsCompVolts, 3) - 255.86 * pow(tdsCompVolts, 2) + 857.39 * tdsCompVolts) * 0.5 * tdsCalibrationFactor;

  float rawTurbidityVoltage = analogRead(TURBIDITY_PIN) * (5.0 / 1023.0);
  smoothedTurbidityVoltage = isTurbidityFirstRead ? rawTurbidityVoltage : (rawTurbidityVoltage * 0.1) + (smoothedTurbidityVoltage * 0.9);
  isTurbidityFirstRead = false;
  calculatedNTU = (smoothedTurbidityVoltage >= 4.80) ? 0.0 : max(0.0f, (4.80 - smoothedTurbidityVoltage) * (100.0 / (4.80 - 4.735)));
}

// ---------------------------------------------------------------
// SMS alerts
// ---------------------------------------------------------------
void sendSMS(String message, bool critical) {
  if (!smsNotificationsEnabled || alertPhoneNumber.length() == 0) return;
  if (critical && !smsCriticalEnabled) return;
  if (!critical && !smsWarningEnabled) return;
  Serial1.println("AT+CMGF=1");
  delay(100);
  Serial1.print("AT+CMGS=\"");
  Serial1.print(alertPhoneNumber);
  Serial1.println("\"");
  delay(100);
  Serial1.print(message);
  delay(100);
  Serial1.write(26);
  delay(2000);
}

void updateSmsAlertState(
  bool critical,
  bool warning,
  bool& wasCritical,
  bool& wasWarning,
  const String& criticalMessage,
  const String& warningMessage
) {
  if (critical) {
    if (!wasCritical) sendSMS(criticalMessage, true);
    wasCritical = true;
    wasWarning = false;
  } else if (warning) {
    if (!wasWarning) sendSMS(warningMessage, false);
    wasCritical = false;
    wasWarning = true;
  } else {
    wasCritical = false;
    wasWarning = false;
  }
}

void evaluateThresholds() {
  bool tempCritical = smoothedCalTempC < 10.0 || smoothedCalTempC > 35.0;
  bool tempWarning = !tempCritical && (smoothedCalTempC < 25.0 || smoothedCalTempC > 32.0);
  updateSmsAlertState(
    tempCritical, tempWarning, isTempCritical, isTempWarning,
    "CRITICAL: Temp " + String(smoothedCalTempC, 1) + "C",
    "WARNING: Temp " + String(smoothedCalTempC, 1) + "C"
  );

  bool phCritical = calculatedpH < 4.0 || calculatedpH > 9.0;
  bool phWarning = !phCritical && calculatedpH < 6.5;
  updateSmsAlertState(
    phCritical, phWarning, isPHCritical, isPHWarning,
    "CRITICAL: pH " + String(calculatedpH, 1),
    "WARNING: pH " + String(calculatedpH, 1)
  );

  bool doCritical = calculatedDO < 3.0;
  bool doWarning = !doCritical && calculatedDO <= 5.0;
  updateSmsAlertState(
    doCritical, doWarning, isDOCritical, isDOWarning,
    "CRITICAL: DO " + String(calculatedDO, 1) + " mg/L",
    "WARNING: DO " + String(calculatedDO, 1) + " mg/L"
  );

  bool ecCritical = calculatedEC > 5.0;
  bool ecWarning = !ecCritical && (calculatedEC < 0.1 || calculatedEC > 2.0);
  updateSmsAlertState(
    ecCritical, ecWarning, isECCritical, isECWarning,
    "CRITICAL: EC " + String(calculatedEC, 2),
    "WARNING: EC " + String(calculatedEC, 2)
  );

  bool tdsCritical = calculatedTDS > 350.0;
  bool tdsWarning = !tdsCritical && calculatedTDS < 150.0;
  updateSmsAlertState(
    tdsCritical, tdsWarning, isTDSCritical, isTDSWarning,
    "CRITICAL: TDS " + String(calculatedTDS, 0),
    "WARNING: TDS " + String(calculatedTDS, 0)
  );

  bool turbidityCritical = calculatedNTU < 10.0 || calculatedNTU > 150.0;
  bool turbidityWarning = !turbidityCritical && (calculatedNTU < 30.0 || calculatedNTU > 80.0);
  updateSmsAlertState(
    turbidityCritical, turbidityWarning, isTurbidityCritical, isTurbidityWarning,
    "CRITICAL: Turbidity " + String(calculatedNTU, 1),
    "WARNING: Turbidity " + String(calculatedNTU, 1)
  );
}

// ---------------------------------------------------------------
// Firebase upload
// ---------------------------------------------------------------
void pushToFirebase() {
  if (!ensureDeviceToken()) {
    logSerial("[Firebase] No valid device token; upload skipped.");
    return;
  }
  if (!sslClient.connect(firebaseHost, 443)) {
    logSerial("[Firebase] Data connection failed.");
    return;
  }

  String json = "{\"temp\":" + String(smoothedCalTempC, 2) +
    ",\"ph\":" + String(calculatedpH, 2) +
    ",\"do\":" + String(calculatedDO, 2) +
    ",\"ec\":" + String(calculatedEC, 2) +
    ",\"tds\":" + String(calculatedTDS, 0) +
    ",\"ntu\":" + String(calculatedNTU, 1) + "}";
  String path = String("/devices/") + DEVICE_ID + "/live_data.json?auth=" + firebaseIdToken;

  sslClient.print("PUT ");
  sslClient.print(path);
  sslClient.println(" HTTP/1.1");
  sslClient.print("Host: ");
  sslClient.println(firebaseHost);
  sslClient.println("Connection: close");
  sslClient.println("Content-Type: application/json");
  sslClient.print("Content-Length: ");
  sslClient.println(json.length());
  sslClient.println();
  sslClient.print(json);

  String statusLine;
  String responseBody;
  if (readHttpResponse(sslClient, statusLine, responseBody)) {
    logSerial("[Firebase] Readings uploaded for " + String(DEVICE_ID));
  } else {
    logSerial("[Firebase] Upload failed. Check Firebase rules and device account provisioning.");
    logSerial(statusLine);
    logSerial(responseBody);
  }
}

void pushSerialMonitorToFirebase() {
  if (serialLogCount == 0 || !ensureDeviceToken()) return;
  if (!sslClient.connect(firebaseHost, 443)) {
    logSerial("[Firebase] Serial monitor connection failed.");
    return;
  }

  String path = String("/devices/") + DEVICE_ID + "/serial_monitor.json?auth=" + firebaseIdToken;
  String json = serialLogJson();
  sslClient.print("PUT ");
  sslClient.print(path);
  sslClient.println(" HTTP/1.1");
  sslClient.print("Host: ");
  sslClient.println(firebaseHost);
  sslClient.println("Connection: close");
  sslClient.println("Content-Type: application/json");
  sslClient.print("Content-Length: ");
  sslClient.println(json.length());
  sslClient.println();
  sslClient.print(json);

  String statusLine;
  String responseBody;
  if (readHttpResponse(sslClient, statusLine, responseBody)) {
    logSerial("[Firebase] Serial monitor logs uploaded.");
  } else {
    logSerial("[Firebase] Serial monitor upload failed.");
    logSerial(statusLine);
    logSerial(responseBody);
  }
}

// ---------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------
void loop() {
  if (portalActive) {
    handlePortal();
  } else {
    readSensors();
    evaluateThresholds();

    // If Wi-Fi dropped, try to reconnect before resorting to a reset
    if (WiFi.status() != WL_CONNECTED) {
      logSerial("[WiFi] Connection lost, reconnecting...");
      if (!connectWiFi(ssid, pass)) {
        NVIC_SystemReset();
      }
    }

    if (WiFi.status() == WL_CONNECTED) {
      if (millis() - lastDeviceConfigFetch >= deviceConfigFetchInterval) {
        fetchPhoneNumberFromFirebase();
      }
      if (millis() - lastUploadTime > uploadInterval) {
        logSerial("[Sensors] Temp=" + String(smoothedCalTempC, 2) + " C | pH=" +
          String(calculatedpH, 2) + " | DO=" + String(calculatedDO, 2) +
          " mg/L | EC=" + String(calculatedEC, 2) + " mS/cm | TDS=" +
          String(calculatedTDS, 0) + " ppm | NTU=" + String(calculatedNTU, 1));
        pushToFirebase();
        lastUploadTime = millis();
      }
      if (millis() - lastSerialLogUpload >= serialLogUploadInterval) {
        pushSerialMonitorToFirebase();
        lastSerialLogUpload = millis();
      }
    }
    delay(1000);
  }
}
