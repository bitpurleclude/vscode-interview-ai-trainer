import React from "react";
import { PracticeFlow } from "./PracticeFlow";
import { ResultsPanel } from "./ResultsPanel";

type PracticeContentProps = {
  practiceProps: React.ComponentProps<typeof PracticeFlow>;
  resultsProps: React.ComponentProps<typeof ResultsPanel>;
};

export const PracticeContent: React.FC<PracticeContentProps> = ({
  practiceProps,
  resultsProps,
}) => {
  return (
    <>
      <PracticeFlow {...practiceProps} />
      <ResultsPanel {...resultsProps} />
    </>
  );
};
