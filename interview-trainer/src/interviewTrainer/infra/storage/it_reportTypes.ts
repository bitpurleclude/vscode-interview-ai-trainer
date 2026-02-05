export interface ItReportConfig {
  attemptHeading: string;
  segmentHeading: string;
  attemptNote?: string;
}

export interface ItOutlineNode {
  text: string;
  children: ItOutlineNode[];
}