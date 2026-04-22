/**
 * 마크다운 문서를 Word(.docx)로 변환하는 스크립트
 * 사용법: node scripts/md-to-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType,
  ShadingType, TableLayoutType
} = require('docx');

const inputFile = process.argv[2] || 'subak-server-monitoring-summary.md';
const MD_PATH = path.join(__dirname, '..', 'docs', inputFile);
const DOCX_PATH = MD_PATH.replace(/\.md$/, '.docx');

// 마크다운 파싱 유틸리티
function parseMd(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 빈 줄 무시
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 메타 정보 (>)
    if (line.startsWith('> ')) {
      blocks.push({ type: 'blockquote', text: line.substring(2) });
      i++;
      continue;
    }

    // 구분선
    if (line.trim() === '---') {
      i++;
      continue;
    }

    // 헤딩
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // 코드블록 시작
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 닫는 ```
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      continue;
    }

    // 테이블 감지
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // 헤더/구분/본문 분리
      const rows = tableLines
        .filter(l => !l.match(/^\|[\s\-:|]+\|$/)) // 구분선 제거
        .map(l => l.split('|').filter(c => c.trim() !== '').map(c => c.trim()));
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows });
      }
      continue;
    }

    // 일반 텍스트 (굵게, 코드 등 포함)
    blocks.push({ type: 'paragraph', text: line });
    i++;
  }

  return blocks;
}

// 텍스트에서 인라인 포맷팅 추출
function parseInlineText(text) {
  const runs = [];
  // **bold**, `code`, 일반 텍스트 처리
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|(.+?)(?=\*\*|`|$))/g;
  let match;
  let remaining = text;

  // 단순 파서: **...**, `...` 패턴
  const parts = [];
  let current = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      if (current) parts.push({ text: current, bold: false, code: false });
      current = '';
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        parts.push({ text: text.substring(i + 2, end), bold: true, code: false });
        i = end + 2;
      } else {
        current = '**';
        i += 2;
      }
    } else if (text[i] === '`') {
      if (current) parts.push({ text: current, bold: false, code: false });
      current = '';
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        parts.push({ text: text.substring(i + 1, end), bold: false, code: true });
        i = end + 1;
      } else {
        current = '`';
        i += 1;
      }
    } else {
      current += text[i];
      i++;
    }
  }
  if (current) parts.push({ text: current, bold: false, code: false });

  return parts.map(p => new TextRun({
    text: p.text,
    bold: p.bold,
    font: p.code ? 'Consolas' : 'Malgun Gothic',
    size: p.code ? 18 : 20,
  }));
}

// 블록을 docx 요소로 변환
function toDocxElements(blocks) {
  const children = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const headingMap = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
        };
        children.push(new Paragraph({
          text: block.text,
          heading: headingMap[block.level] || HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
        }));
        break;
      }

      case 'blockquote': {
        children.push(new Paragraph({
          children: parseInlineText(block.text),
          indent: { left: 500 },
          spacing: { before: 80, after: 80 },
        }));
        break;
      }

      case 'code': {
        const codeLines = block.text.split('\n');
        for (const codeLine of codeLines) {
          children.push(new Paragraph({
            children: [new TextRun({
              text: codeLine || ' ',
              font: 'Consolas',
              size: 16,
            })],
            shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
            spacing: { before: 0, after: 0, line: 260 },
            indent: { left: 300 },
          }));
        }
        break;
      }

      case 'table': {
        const tableRows = block.rows.map((row, rowIdx) =>
          new TableRow({
            children: row.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({
                    text: cell,
                    bold: rowIdx === 0,
                    font: 'Malgun Gothic',
                    size: 18,
                  })],
                })],
                shading: rowIdx === 0
                  ? { type: ShadingType.CLEAR, fill: 'D9E2F3' }
                  : undefined,
                width: { size: Math.floor(9000 / Math.max(row.length, 1)), type: WidthType.DXA },
              })
            ),
          })
        );

        children.push(new Table({
          rows: tableRows,
          width: { size: 9000, type: WidthType.DXA },
        }));
        // 표 다음 빈 줄
        children.push(new Paragraph({ text: '' }));
        break;
      }

      case 'paragraph': {
        children.push(new Paragraph({
          children: parseInlineText(block.text),
          spacing: { before: 60, after: 60 },
        }));
        break;
      }
    }
  }

  return children;
}

// 메인 실행
async function main() {
  const blocks = parseMd(MD_PATH);
  const children = toDocxElements(blocks);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
        },
      },
      children,
    }],
    styles: {
      default: {
        document: {
          run: {
            font: 'Malgun Gothic',
            size: 20,
          },
        },
        heading1: {
          run: {
            font: 'Malgun Gothic',
            size: 32,
            bold: true,
            color: '1F4E79',
          },
        },
        heading2: {
          run: {
            font: 'Malgun Gothic',
            size: 26,
            bold: true,
            color: '2E75B6',
          },
        },
        heading3: {
          run: {
            font: 'Malgun Gothic',
            size: 22,
            bold: true,
            color: '404040',
          },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX_PATH, buffer);
  console.log(`변환 완료: ${DOCX_PATH}`);
}

main().catch(err => {
  console.error('변환 실패:', err);
  process.exit(1);
});
