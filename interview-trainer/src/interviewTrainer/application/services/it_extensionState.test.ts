import { describe, expect, it, vi } from "vitest";
import { IT_STATUS_INIT } from "./it_progress";
import { it_updateHostState } from "./it_extensionState";

describe("it_updateHostState", () => {
  it("merges state and emits stateUpdate", () => {
    const send = vi.fn();
    const host = {
      state: {
        ...IT_STATUS_INIT,
        statusMessage: "old",
        overallProgress: 10,
      },
      webviewProtocol: { send },
    };

    it_updateHostState(host, {
      statusMessage: "new",
      overallProgress: 42,
    });

    expect(host.state.statusMessage).toBe("new");
    expect(host.state.overallProgress).toBe(42);
    expect(host.state.recordingState).toBe("idle");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("it/stateUpdate", host.state);
  });
});
