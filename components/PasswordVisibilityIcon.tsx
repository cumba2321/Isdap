import Svg, { Circle, Line, Path } from 'react-native-svg';

type PasswordVisibilityIconProps = {
  visible: boolean;
  color?: string;
  size?: number;
};

export default function PasswordVisibilityIcon({
  visible,
  color = '#334B53',
  size = 22,
}: PasswordVisibilityIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M1.5 12S5.25 4.5 12 4.5 22.5 12 22.5 12 18.75 19.5 12 19.5 1.5 12 1.5 12Z"
        fill={color}
      />
      <Circle cx="12" cy="12" r="5" fill="#FFFFFF" />
      <Circle cx="12" cy="12" r="2.8" fill={color} />
      {!visible ? (
        <Line
          x1="4"
          y1="4"
          x2="20"
          y2="20"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      ) : null}
    </Svg>
  );
}
