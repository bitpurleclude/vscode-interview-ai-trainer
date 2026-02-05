import React from "react";

type InfoTipProps = {
  text: string;
};

export const InfoTip: React.FC<InfoTipProps> = ({ text }) => {
  return (
    <span className="it-tip" data-tip={text} title={text} tabIndex={0} aria-label={text}>
      !
    </span>
  );
};
