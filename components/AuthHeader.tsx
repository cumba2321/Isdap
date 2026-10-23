import { Image, Text, View } from 'react-native';
import { styles } from '../styles';
 
type AuthHeaderProps = {
  tagline?: string;
};
 
export default function AuthHeader({ tagline }: AuthHeaderProps) {
  return (
    <View style={styles.authHeader}>
      <View style={styles.authLogoCircle}>
        <Image
          source={require('../assets/isdapp-logo.png')}
          style={{ height: 68, width: 68 }}
          resizeMode="contain"
          accessibilityLabel="IsdaApp water-quality logo"
        />
      </View>
      <Text style={styles.authAppName}>IsdaApp</Text>
      {tagline ? <Text style={styles.authTagline}>{tagline}</Text> : null}
    </View>
  );
}
 