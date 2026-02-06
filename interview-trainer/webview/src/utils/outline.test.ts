import { describe, expect, it } from "vitest";
import React from "react";
import { buildOutlineTree, extractOutlinePaths, renderOutlineTree, renderParagraphs } from "./outline";

describe("extractOutlinePaths", () => {
  it("parses arrow paths", () => {
    const items = ["A -> B -> C"];
    expect(extractOutlinePaths(items)).toEqual([["A", "B", "C"]]);
  });

  it("parses numbered headings and list items", () => {
    const items = ["一、总论", "（1）细节", "- 子项", "  - 子子项"];
    const paths = extractOutlinePaths(items);
    expect(paths).toEqual([
      ["一、总论"],
      ["一、总论", "（1）细节"],
      ["子项"],
      ["子项", "子子项"],
    ]);
  });

  it("handles empty marker text and plain lines", () => {
    const items = ["-   ", "一、总论", "补充", "普通行"];
    const paths = extractOutlinePaths(items);
    expect(paths).toEqual([
      ["一、总论"],
      ["一、总论", "补充"],
      ["一、总论", "普通行"],
    ]);
  });
});

describe("buildOutlineTree", () => {
  it("builds a tree from outline paths", () => {
    const items = ["A -> B", "A -> C", "D"];
    const tree = buildOutlineTree(items);
    expect(tree).toEqual([
      {
        text: "A",
        children: [
          { text: "B", children: [] },
          { text: "C", children: [{ text: "D", children: [] }] },
        ],
      },
    ]);
  });
});

describe("renderOutlineTree", () => {
  it("renders nested list elements", () => {
    const nodes = [{ text: "A", children: [{ text: "B", children: [] }] }];
    const element = renderOutlineTree(nodes, "k");
    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe("ul");
  });
});

describe("renderParagraphs", () => {
  it("renders empty placeholder", () => {
    const element = renderParagraphs("", "k");
    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe("span");
  });

  it("renders paragraphs from text", () => {
    const element = renderParagraphs("a\n\nb", "k");
    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe("div");
    expect(element.props.className).toBe("it-paragraphs");
  });
});
