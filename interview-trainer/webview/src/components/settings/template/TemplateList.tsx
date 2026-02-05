import React from "react";
import type { ItApiTemplate } from "../../../types";

type TemplateListProps = {
  uiLocked: boolean;
  templatesByCategory: ItApiTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: React.Dispatch<React.SetStateAction<string>>;
  boundIds: Set<string>;
  handleCreateTemplate: () => void;
  handleDeleteTemplate: (templateId?: string) => void;
  deleteConfirmId: string | null;
  setDeleteConfirmId: React.Dispatch<React.SetStateAction<string | null>>;
};

export const TemplateList: React.FC<TemplateListProps> = ({
  uiLocked,
  templatesByCategory,
  selectedTemplateId,
  setSelectedTemplateId,
  boundIds,
  handleCreateTemplate,
  handleDeleteTemplate,
  deleteConfirmId,
  setDeleteConfirmId,
}) => {
  return (
    <div className="it-template__list">
      <div className="it-template__list-header">
        <div className="it-template__list-title">模板列表</div>
        <button
          className="it-button it-button--secondary it-button--compact"
          disabled={uiLocked}
          onClick={handleCreateTemplate}
        >
          新建
        </button>
      </div>
      <div className="it-template__list-body">
        {templatesByCategory.length ? (
          templatesByCategory.map((item) => {
            const isSelected = selectedTemplateId === item.id;
            const isBound = boundIds.has(item.id);
            return (
              <div key={item.id} className="it-template__list-row">
                <button
                  className={`it-template__list-item ${isSelected ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setSelectedTemplateId(item.id)}
                  aria-pressed={isSelected}
                >
                  <div className="it-template__list-name">{item.name || item.id}</div>
                  <div className="it-template__list-meta">{item.id}</div>
                </button>
                <div className="it-template__list-actions">
                  {isSelected && (
                    <span className="it-template__list-tag">已选中</span>
                  )}
                  {isBound && (
                    <span className="it-template__list-tag it-template__list-tag--bound">
                      已绑定
                    </span>
                  )}
                  {deleteConfirmId === item.id ? (
                    <>
                      <button
                        className="it-button it-button--danger it-button--compact it-template__list-delete"
                        type="button"
                        disabled={uiLocked || isBound}
                        onClick={() => {
                          setDeleteConfirmId(null);
                          handleDeleteTemplate(item.id);
                        }}
                      >
                        确认删除
                      </button>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        type="button"
                        disabled={uiLocked}
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      className="it-button it-button--secondary it-button--compact it-template__list-delete"
                      type="button"
                      disabled={uiLocked || isBound}
                      title={isBound ? "已绑定，无法删除" : "删除模板"}
                      onClick={() => setDeleteConfirmId(item.id)}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="it-placeholder">暂无模板，请新建。</div>
        )}
      </div>
    </div>
  );
};
