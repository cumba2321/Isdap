import { Text, View } from 'react-native';
import { styles } from '../styles';
 
type AuthHeaderProps = {
  tagline?: string;
};
 
export default function AuthHeader({ tagline }: AuthHeaderProps) {
  return (
    <View style={styles.authHeader}>
      <View style={styles.authLogoCircle}>
        <Text style={styles.authLogoEmoji}>🐟</Text>
      </View>
      <Text style={styles.authAppName}>IsdaApp</Text>
      {tagline ? <Text style={styles.authTagline}>{tagline}</Text> : null}
    </View>
  );
}
 