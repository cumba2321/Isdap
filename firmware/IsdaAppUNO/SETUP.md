# IsdaApp UNO R4 WiFi secure device setup

This firmware signs in as a dedicated Firebase Authentication user. Realtime Database rules let that device account write only its own `live_data` and bounded `serial_monitor` snapshot, while app users can read them only while they own the device claim.

## Provision the device in Firebase

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**. This uses Firebase Authentication; the design does not require Cloud Functions.
2. Under **Authentication → Users**, create a dedicated account for this physical board. Do not reuse a human user's login. Use a unique, long password.
3. Copy the new device user's Firebase **UID**.
4. In **Realtime Database → Data**, create:

   ```json
   {
     "deviceSecrets": {
       "pond-uno-r4-001": {
         "claimCode": "REPLACE_WITH_A_RANDOM_PRIVATE_CODE"
       }
     },
     "deviceConfig": {
       "pond-uno-r4-001": {
         "authUid": "REPLACE_WITH_DEVICE_AUTH_UID",
         "alertNumber": "",
         "smsEnabled": false,
         "smsCritical": false,
         "smsWarning": false
       }
     }
   }
   ```

   Choose a private claim code 1–128 characters long; any characters are allowed. It must be entered exactly the same way in the app. Short codes are easier to guess, so use a long, unpredictable code if possible. Do not use the device ID as the claim code. Keep the claim code private and encode it into a QR value in this format:

   ```text
   ISDAAPP:pond-uno-r4-001:YOUR_PRIVATE_CLAIM_CODE
   ```

   In a QR payload, the app treats everything after `ISDAAPP:device-id:` as the claim code, so the claim code may itself contain colons.

   `deviceSecrets` is administrative and stays private. The device UID can read its own device configuration. After a user claims the device, the app writes the shared account SMS recipient and alert preferences to that device's `alertNumber`, `smsEnabled`, `smsCritical`, and `smsWarning` fields under the published rules.

5. Do not publish the restrictive rules yet. First upload the authenticated firmware below so the board is ready to sign in and write to its per-device paths.

## Prepare the sketch

1. Copy `Secrets.h.example` to `Secrets.h` in this sketch folder. The real `Secrets.h` is git-ignored.
2. Fill in the ID, Firebase device-account email/password, and Firebase Web API key from `firebaseConfig.ts`. Keep the device password private and never commit `Secrets.h`.
3. Open `IsdaAppUNO.ino` in Arduino IDE, install the existing OneWire and DallasTemperature libraries, choose **Arduino UNO R4 WiFi** and its port, then compile and upload.
4. Open Serial Monitor at 115200 baud. A successful setup should show that the device account signed in and readings are being uploaded. Firmware serial messages and sensor summaries are also published to the app's Serial Monitor; Firebase keeps only the most recent 10 messages for each device.
5. In **Realtime Database → Rules**, replace the rules with the contents of the repository's `database.rules.json` and publish. Existing root-level/public rules must not remain above or alongside these rules.

## Claim and transfer

- A user signs in to IsdaApp and opens **Settings → My devices**.
- They enter the device ID and private claim code, or paste the QR payload into the Device ID field. The app claims the database record atomically; a device already owned by another UID cannot be claimed.
- Unlinking removes the owner's claim and app-list entry in one Realtime Database update. The board continues uploading, and another signed-in user with the private code can claim it.
- The device ID is public routing information, not a credential. The claim code and device Firebase password are credentials.
- In **Settings → Notifications**, enabling SMS reveals the shared recipient number field. Save an international-format number such as `+639171234567`; the app updates every device linked to that account. The firmware refreshes these settings from Firebase about once per minute, so a changed number or SMS preference takes effect without uploading new firmware.
- The SIM800L must have an active SIM with SMS service, sufficient credit, and a suitable stable power supply. The app cannot provide the carrier service or SIM balance.

If users already have a copy of an older sketch, it continues writing only to `/live_data`; update and upload this authenticated sketch before publishing the restrictive database rules. The app now reads per-device paths and deliberately does not automatically attach newly created accounts to any sensor.
