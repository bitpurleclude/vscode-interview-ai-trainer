import type { ItState } from "../../../protocol/interviewTrainer";

export type ItExtensionStatePort = {
  send(type: "it/stateUpdate", data: ItState): void;
};

export interface ItExtensionStateHost {
  state: ItState;
  webviewProtocol: ItExtensionStatePort;
}

export function it_updateHostState(
  host: ItExtensionStateHost,
  nextState: Partial<ItState>,
): void {
  host.state = { ...host.state, ...nextState };
  host.webviewProtocol.send("it/stateUpdate", host.state);
}
