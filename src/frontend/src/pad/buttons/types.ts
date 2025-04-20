export type ActionType = 'embed' | 'open-tab' | 'magnet';
export type TargetType = 'terminal' | 'code';
export type CodeVariant = 'vscode' | 'cursor';

export interface ActionButtonProps {
  target: TargetType;
  label?: string;
  allowedActions?: ActionType[];
  initialAction?: ActionType;
  initialCodeVariant?: CodeVariant;
  pathAnnotation?: string;
  initialShowOptions?: boolean;
  onSettingsToggle?: (isOpen: boolean) => void;
  element?: any; // Parent Excalidraw element
  excalidrawAPI?: any; // Excalidraw API instance
  settingsEnabled?: boolean; // Whether settings can be toggled
  backgroundColor?: string; // Custom background color for the button
}
