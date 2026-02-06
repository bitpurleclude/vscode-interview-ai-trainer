import React from "react";
import type {
  SettingsAsrProps,
  SettingsBindingProps,
  SettingsCommonTemplateProps,
  SettingsEnvProps,
  SettingsInputProps,
  SettingsPromptProps,
  SettingsRetrievalProps,
} from "./settingsTypes";
import { SettingsAsrPanel } from "./SettingsAsrPanel";
import { SettingsBindingPanel } from "./SettingsBindingPanel";
import { SettingsEnvPanel } from "./SettingsEnvPanel";
import { SettingsInputPanel } from "./SettingsInputPanel";
import { SettingsPromptPanel } from "./SettingsPromptPanel";
import { SettingsRetrievalPanel } from "./SettingsRetrievalPanel";
import { SettingsTemplateManager } from "./SettingsTemplateManager";

export type SettingsPageProps = SettingsEnvProps &
  SettingsCommonTemplateProps &
  SettingsBindingProps &
  SettingsAsrProps &
  SettingsPromptProps &
  SettingsInputProps &
  SettingsRetrievalProps;

export const SettingsPage: React.FC<SettingsPageProps> = (props) => {
  return (
    <div className="it-settings">
      <div className="it-settings__grid">
        <SettingsEnvPanel {...props} />
        <SettingsTemplateManager {...props} />
        <SettingsBindingPanel {...props} />
        <SettingsAsrPanel {...props} />
        <SettingsPromptPanel {...props} />
        <SettingsInputPanel {...props} />
        <SettingsRetrievalPanel {...props} />
      </div>
    </div>
  );
};
