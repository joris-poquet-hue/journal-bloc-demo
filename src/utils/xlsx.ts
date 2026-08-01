export type XlsxCellStyle =
  | 'default'
  | 'header'
  | 'date'
  | 'datetime'
  | 'percentage'
  | 'decimal'
  | 'signedPoints'
  | 'title'
  | 'section'
  | 'wrap';

export type XlsxCell = {
  style?: XlsxCellStyle;
  value: boolean | Date | number | string | null;
};

export type XlsxCellValue = XlsxCell['value'] | XlsxCell;

export type XlsxWorksheet = {
  autoFilter?: boolean;
  columnWidths?: number[];
  freezeHeader?: boolean;
  name: string;
  rows: XlsxCellValue[][];
};

const textEncoder = new TextEncoder();
const styleIndexes: Record<XlsxCellStyle, number> = {
  default: 0,
  header: 1,
  date: 2,
  datetime: 3,
  percentage: 4,
  decimal: 5,
  title: 6,
  section: 7,
  wrap: 8,
  signedPoints: 9,
};

function sanitizeXmlText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function escapeXml(value: string) {
  return sanitizeXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getColumnName(index: number) {
  let value = index + 1;
  let name = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function getExcelSerial(value: Date) {
  const localWallClockAsUtc = Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds()
  );

  return localWallClockAsUtc / 86_400_000 + 25_569;
}

function normalizeCell(cell: XlsxCellValue): XlsxCell {
  if (
    cell != null &&
    typeof cell === 'object' &&
    !(cell instanceof Date) &&
    'value' in cell
  ) {
    return cell;
  }

  return { value: cell as XlsxCell['value'] };
}

function serializeCell(cellValue: XlsxCellValue, rowIndex: number, columnIndex: number) {
  const cell = normalizeCell(cellValue);
  const reference = `${getColumnName(columnIndex)}${rowIndex + 1}`;
  const styleIndex = styleIndexes[cell.style ?? 'default'];
  const styleAttribute = styleIndex ? ` s="${styleIndex}"` : '';

  if (cell.value == null || cell.value === '') {
    return styleIndex ? `<c r="${reference}"${styleAttribute}/>` : '';
  }

  if (cell.value instanceof Date) {
    if (Number.isNaN(cell.value.getTime())) {
      return '';
    }

    return `<c r="${reference}"${styleAttribute} t="n"><v>${getExcelSerial(
      cell.value
    )}</v></c>`;
  }

  if (typeof cell.value === 'number') {
    return Number.isFinite(cell.value)
      ? `<c r="${reference}"${styleAttribute} t="n"><v>${cell.value}</v></c>`
      : '';
  }

  if (typeof cell.value === 'boolean') {
    return `<c r="${reference}"${styleAttribute} t="b"><v>${
      cell.value ? 1 : 0
    }</v></c>`;
  }

  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    cell.value
  )}</t></is></c>`;
}

function buildWorksheetXml(worksheet: XlsxWorksheet) {
  const rowCount = Math.max(worksheet.rows.length, 1);
  const columnCount = Math.max(
    ...worksheet.rows.map((row) => row.length),
    worksheet.columnWidths?.length ?? 0,
    1
  );
  const dimension = `A1:${getColumnName(columnCount - 1)}${rowCount}`;
  const columns = worksheet.columnWidths?.length
    ? `<cols>${worksheet.columnWidths
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${Math.max(
              6,
              Math.min(width, 60)
            )}" customWidth="1"/>`
        )
        .join('')}</cols>`
    : '';
  const frozenPane = worksheet.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : '';
  const rows = worksheet.rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, columnIndex) => serializeCell(cell, rowIndex, columnIndex))
          .join('')}</row>`
    )
    .join('');
  const autoFilter =
    worksheet.autoFilter && worksheet.rows.length > 1
      ? `<autoFilter ref="A1:${getColumnName(columnCount - 1)}${rowCount}"/>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0">${frozenPane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${columns}
  <sheetData>${rows}</sheetData>
  ${autoFilter}
</worksheet>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="4">
    <numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>
    <numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/>
    <numFmt numFmtId="166" formatCode="0.0"/>
    <numFmt numFmtId="167" formatCode="+0;-0;0"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF102A63"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF102A63"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F6E7C"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F8FB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFD8E7EF"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function getSanitizedWorksheetName(value: string, existingNames: Set<string>) {
  const baseName = value.replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Feuille';
  let name = baseName;
  let suffix = 2;

  while (existingNames.has(name.toLocaleLowerCase('fr-FR'))) {
    const suffixLabel = ` ${suffix}`;
    name = `${baseName.slice(0, 31 - suffixLabel.length)}${suffixLabel}`;
    suffix += 1;
  }

  existingNames.add(name.toLocaleLowerCase('fr-FR'));
  return name;
}

function getDosTimestamp(value: Date) {
  const year = Math.max(1980, value.getFullYear());
  const time =
    (value.getHours() << 11) |
    (value.getMinutes() << 5) |
    Math.floor(value.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();

  return { date, time };
}

const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function getCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]) {
  const result = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  );
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return result;
}

function createZip(files: Array<{ name: string; content: string }>) {
  const now = new Date();
  const dosTimestamp = getDosTimestamp(now);
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  files.forEach((file) => {
    const nameBytes = textEncoder.encode(file.name);
    const dataBytes = textEncoder.encode(file.content);
    const crc = getCrc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTimestamp.time, true);
    localView.setUint16(12, dosTimestamp.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTimestamp.time, true);
    centralView.setUint16(14, dosTimestamp.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, dataBytes);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  });

  const centralDirectory = concatBytes(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localChunks, centralDirectory, endRecord]);
}

export function createXlsxBlob(worksheets: XlsxWorksheet[]) {
  const existingNames = new Set<string>();
  const normalizedWorksheets = worksheets.map((worksheet) => ({
    ...worksheet,
    name: getSanitizedWorksheetName(worksheet.name, existingNames),
  }));
  const worksheetFiles = normalizedWorksheets.map((worksheet, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    content: buildWorksheetXml(worksheet),
  }));
  const workbookRelationships = normalizedWorksheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
          index + 1
        }.xml"/>`
    )
    .join('');
  const workbookSheets = normalizedWorksheets
    .map(
      (worksheet, index) =>
        `<sheet name="${escapeXml(worksheet.name)}" sheetId="${index + 1}" r:id="rId${
          index + 1
        }"/>`
    )
    .join('');
  const sheetContentTypes = normalizedWorksheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${
          index + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');
  const createdAt = new Date().toISOString();
  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetContentTypes}
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: 'docProps/core.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Mon Journal de Bloc</dc:creator>
  <cp:lastModifiedBy>Mon Journal de Bloc</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Mon Journal de Bloc</Application>
  <AppVersion>1.0</AppVersion>
</Properties>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView activeTab="0"/></bookViews>
  <sheets>${workbookSheets}</sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRelationships}
  <Relationship Id="rId${
    normalizedWorksheets.length + 1
  }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', content: buildStylesXml() },
    ...worksheetFiles,
  ];

  return new Blob([createZip(files)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadXlsxWorkbook(worksheets: XlsxWorksheet[], filename: string) {
  const blob = createXlsxBlob(worksheets);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
