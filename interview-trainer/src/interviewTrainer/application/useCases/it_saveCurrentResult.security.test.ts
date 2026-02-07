import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendAttemptDataAsync: vi.fn(),
  appendReportAsync: vi.fn(),
  buildQuestionFingerprint: vi.fn(() => "fingerprint"),
  nextAttemptIndexAsync: vi.fn(async () => 1),
  readTopicMetaAsync: vi.fn(async () => ({})),
  reportPathForTopicAsync: vi.fn(async () => "/topic/report.md"),
  resolveTopicDirAsync: vi.fn(async () => "/topic"),
  storeAudioCopy: vi.fn((audioPath: string) => audioPath),
  updateReferenceNotesFileAsync: vi.fn(async () => {}),
  writeTopicMetaAsync: vi.fn(async () => {}),
  hashText: vi.fn(() => "hash"),
  normalizeText: vi.fn((value: string) => value),
  deriveTopicTitle: vi.fn(() => "Derived Title"),
  sanitizeTopicTitle: vi.fn((value: string) => value),
}));

vi.mock("../services/it_storageGateway", () => ({
  it_appendAttemptDataAsync: mocks.appendAttemptDataAsync,
  it_appendReportAsync: mocks.appendReportAsync,
  it_buildQuestionFingerprint: mocks.buildQuestionFingerprint,
  it_nextAttemptIndexAsync: mocks.nextAttemptIndexAsync,
  it_readTopicMetaAsync: mocks.readTopicMetaAsync,
  it_reportPathForTopicAsync: mocks.reportPathForTopicAsync,
  it_resolveTopicDirAsync: mocks.resolveTopicDirAsync,
  it_storeAudioCopy: mocks.storeAudioCopy,
  it_updateReferenceNotesFileAsync: mocks.updateReferenceNotesFileAsync,
  it_writeTopicMetaAsync: mocks.writeTopicMetaAsync,
}));

vi.mock("../services/it_textGateway", () => ({
  it_hashText: mocks.hashText,
  it_normalizeText: mocks.normalizeText,
}));

vi.mock("../services/it_topicTitle", () => ({
  it_deriveTopicTitle: mocks.deriveTopicTitle,
  it_sanitizeTopicTitle: mocks.sanitizeTopicTitle,
}));

import { it_saveCurrentResult } from "./it_saveCurrentResult";

function createPayload(): any {
  return {
    response: {
      transcript: "transcript",
      detailedTranscript: "detail",
      acoustic: {
        durationSec: 60,
      },
      evaluation: {
        topicTitle: "",
        overallScore: 80,
      },
      notes: [],
      audioSegments: [],
      questionTimings: [],
      reportPath: "/old/report.md",
      topicDir: "/old-topic",
      audioPath: "/old-topic/audio.wav",
      questionText: "question text",
      questionList: ["question 1"],
    },
    questionText: "question text",
    questionList: ["question 1"],
    topicTitle: "",
  };
}

describe("it_saveCurrentResult security", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as any).mockReset();
      }
    }
    mocks.appendAttemptDataAsync.mockResolvedValue(undefined);
    mocks.appendReportAsync.mockResolvedValue(undefined);
    mocks.buildQuestionFingerprint.mockReturnValue("fingerprint");
    mocks.nextAttemptIndexAsync.mockResolvedValue(1);
    mocks.readTopicMetaAsync.mockResolvedValue({});
    mocks.reportPathForTopicAsync.mockResolvedValue("/topic/report.md");
    mocks.resolveTopicDirAsync.mockResolvedValue("/topic");
    mocks.storeAudioCopy.mockImplementation((audioPath: string) => audioPath);
    mocks.updateReferenceNotesFileAsync.mockResolvedValue(undefined);
    mocks.writeTopicMetaAsync.mockResolvedValue(undefined);
    mocks.hashText.mockReturnValue("hash");
    mocks.normalizeText.mockImplementation((value: string) => value);
    mocks.deriveTopicTitle.mockReturnValue("Derived Title");
    mocks.sanitizeTopicTitle.mockImplementation((value: string) => value);
  });

  it("stops downstream writes when report append fails", async () => {
    mocks.appendReportAsync.mockRejectedValue(new Error("disk full"));

    await expect(
      it_saveCurrentResult({
        payload: createPayload(),
        configBundle: {
          skill: {
            sessions_dir: "sessions",
          },
        } as any,
        requireWorkspaceRoot: () => "/workspace",
      }),
    ).rejects.toThrow(/disk full/i);

    expect(mocks.updateReferenceNotesFileAsync).not.toHaveBeenCalled();
    expect(mocks.appendAttemptDataAsync).not.toHaveBeenCalled();
    expect(mocks.writeTopicMetaAsync).not.toHaveBeenCalled();
  });

  it("persists metadata only after report write succeeds", async () => {
    await expect(
      it_saveCurrentResult({
        payload: createPayload(),
        configBundle: {
          skill: {
            sessions_dir: "sessions",
          },
        } as any,
        requireWorkspaceRoot: () => "/workspace",
      }),
    ).resolves.toMatchObject({
      ok: true,
      attemptIndex: 1,
      reportPath: "/topic/report.md",
    });

    expect(mocks.appendReportAsync).toHaveBeenCalledTimes(1);
    expect(mocks.updateReferenceNotesFileAsync).toHaveBeenCalledTimes(1);
    expect(mocks.appendAttemptDataAsync).toHaveBeenCalledTimes(1);
    expect(mocks.writeTopicMetaAsync).toHaveBeenCalledTimes(1);
  });
});
