# AGENTS.md

���ֿ���� VS Code/Windsurf ���������ѵ�����֣�interview-trainer�������ļ�Ϊ AI ��������ṩ��С����ָ����

## �ؼ�Ŀ¼

- `interview-trainer/`���������Ŀ
  - `src/`����չ���߼���VS Code Extension��
  - `webview/`��ǰ�� UI��React��
  - `scripts/`�������ű�
  - `build/`���������
- `docs/`��˵���ĵ�
- `testdata/`����������

## ��������� `interview-trainer/` ��ִ�У�

- ��װ������`npm install`
- ������`npm run build`������ webview + extension��
- �����`npm run package`������ `build/interview-trainer.vsix`��

## �����Ự

- �������Ĭ��Ŀ¼��`<������>/sessions/YYYYMMDD/<topic-slug>/`
- ������Ƶ�������Ԫ�����ļ�

## ˵��

- ����д���ı�����ʹ�� UTF-8 ���룬����������롣
- Ŀǰ�޶������Խű������޸ĺ����߼��������������� `npm run build` ��֤��
- VSIX �������λ�� `interview-trainer/build/`��
- ����������� ffmpeg��`ffmpeg-static`�������ʱ������� `node_modules/ffmpeg-static`������¼��/תд/��Ƶ�����޷��������С�
## 日志开关与打印规则

- 日志默认关闭，仅在设置页点击“开启日志输出”后开始打印。
- 输出位置：VS Code 输出面板 → 选择 `Interview Trainer`。
- 当前日志范围：语料扫描与向量预计算（笔记学习阶段）。
- 关闭 VS Code 后日志开关重置，需要再次手动开启。
