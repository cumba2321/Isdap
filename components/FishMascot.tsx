import { Image, ImageStyle, StyleProp } from 'react-native';

const FISH_MASCOT = require('../assets/fish-mascot-user.gif');
const WORRIED_FISH_MASCOT = require('../assets/fish-mascot-worried.gif');
const SAD_FISH_MASCOT = require('../assets/fish-mascot-sad.png');

export type FishMascotVariant = 'happy' | 'worried' | 'sad';

type FishMascotProps = {
  style: StyleProp<ImageStyle>;
  variant?: FishMascotVariant;
  accessibilityLabel?: string;
};

export default function FishMascot({
  style,
  variant = 'happy',
  accessibilityLabel,
}: FishMascotProps) {
  const source = variant === 'worried'
    ? WORRIED_FISH_MASCOT
    : variant === 'sad'
      ? SAD_FISH_MASCOT
      : FISH_MASCOT;

  return (
    <Image
      source={source}
      style={style}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel ?? `${variant} IsdaApp fish mascot`}
    />
  );
}
