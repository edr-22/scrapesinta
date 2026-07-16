(() => {
  "use strict";

  const HEADERS = [
    { key: "name", label: "Nama Jurnal", type: "string", width: 44 },
    { key: "sintaProfileUrl", label: "Link Profil SINTA", type: "string", width: 38 },
    { key: "journalUrl", label: "Link Jurnal / Website", type: "string", width: 42 },
    { key: "editorUrl", label: "Editor URL", type: "string", width: 42 },
    { key: "googleScholarUrl", label: "Google Scholar", type: "string", width: 42 },
    { key: "garudaUrl", label: "Garuda URL", type: "string", width: 42 },
    { key: "affiliation", label: "Afiliasi / Penerbit", type: "string", width: 44 },
    { key: "pIssn", label: "P-ISSN", type: "string", width: 14 },
    { key: "eIssn", label: "E-ISSN", type: "string", width: 14 },
    { key: "subjectArea", label: "Subject Area", type: "string", width: 28 },
    { key: "accreditation", label: "Akreditasi", type: "string", width: 16 },
    { key: "scopusIndexed", label: "Scopus Indexed", type: "string", width: 16 },
    { key: "garudaIndexed", label: "Garuda Indexed", type: "string", width: 16 },
    { key: "impact", label: "Impact", type: "number", width: 12 },
    { key: "h5Index", label: "H5-index", type: "number", width: 12 },
    { key: "citations5yr", label: "Citations 5yr", type: "number", width: 16 },
    { key: "citations", label: "Citations", type: "number", width: 14 },
    { key: "coverUrl", label: "Cover URL", type: "string", width: 42 },
    { key: "sourcePageNumber", label: "Halaman", type: "number", width: 10 },
    { key: "sourcePage", label: "Source Page", type: "string", width: 42 },
    { key: "scrapedAt", label: "Scraped At", type: "string", width: 24 }
  ];

  const encoder = new TextEncoder();
  let crcTable = null;

  function getHeaders() {
    return HEADERS.map((header) => ({ ...header }));
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function normalizeNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : "";
    }

    let text = String(value ?? "").trim();
    if (!text || text === "-") {
      return "";
    }

    text = text.replace(/\s+/g, "");
    if (text.includes(",")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, "");
    }

    const number = Number(text);
    return Number.isFinite(number) ? number : "";
  }

  function columnName(index) {
    let name = "";
    let current = index;
    while (current > 0) {
      const modulo = (current - 1) % 26;
      name = String.fromCharCode(65 + modulo) + name;
      current = Math.floor((current - modulo) / 26);
    }
    return name;
  }

  function cellXml(rowIndex, colIndex, value, header, styleId = "") {
    const ref = `${columnName(colIndex)}${rowIndex}`;
    const style = styleId ? ` s="${styleId}"` : "";

    if (header.type === "number") {
      const number = normalizeNumber(value);
      if (number === "") {
        return `<c r="${ref}"${style}/>`;
      }
      return `<c r="${ref}"${style}><v>${number}</v></c>`;
    }

    const text = escapeXml(value);
    return `<c r="${ref}" t="inlineStr"${style}><is><t>${text}</t></is></c>`;
  }

  function worksheetXml(rows) {
    const headers = getHeaders();
    const rowCount = Math.max(rows.length + 1, 1);
    const lastColumn = columnName(headers.length);
    const range = `A1:${lastColumn}${rowCount}`;
    const cols = headers
      .map((header, index) => {
        const col = index + 1;
        return `<col min="${col}" max="${col}" width="${header.width}" customWidth="1"/>`;
      })
      .join("");

    const headerCells = headers
      .map((header, index) => cellXml(1, index + 1, header.label, { type: "string" }, "1"))
      .join("");

    const dataRows = rows
      .map((row, rowIndex) => {
        const excelRow = rowIndex + 2;
        const cells = headers
          .map((header, colIndex) => cellXml(excelRow, colIndex + 1, row[header.key], header))
          .join("");
        return `<row r="${excelRow}">${cells}</row>`;
      })
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${range}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>
    <row r="1">${headerCells}</row>
    ${dataRows}
  </sheetData>
  <autoFilter ref="${range}"/>
</worksheet>`;
  }

  function workbookXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="SINTA Journals" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
  }

  function workbookRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  function contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
  }

  function coreXml() {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SINTA Journal Export</dc:title>
  <dc:creator>SINTA Journal Scraper</dc:creator>
  <cp:lastModifiedBy>SINTA Journal Scraper</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
  }

  function appXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SINTA Journal Scraper</Application>
</Properties>`;
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) {
      return value;
    }
    return encoder.encode(String(value));
  }

  function u16(value) {
    const bytes = new Uint8Array(2);
    bytes[0] = value & 0xff;
    bytes[1] = (value >>> 8) & 0xff;
    return bytes;
  }

  function u32(value) {
    const bytes = new Uint8Array(4);
    bytes[0] = value & 0xff;
    bytes[1] = (value >>> 8) & 0xff;
    bytes[2] = (value >>> 16) & 0xff;
    bytes[3] = (value >>> 24) & 0xff;
    return bytes;
  }

  function concat(parts) {
    const totalLength = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function getCrcTable() {
    if (crcTable) {
      return crcTable;
    }

    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
    return crcTable;
  }

  function crc32(data) {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let index = 0; index < data.length; index += 1) {
      crc = table[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(date.getFullYear(), 1980);
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
  }

  function zipStore(files) {
    const now = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = toBytes(file.name);
      const data = toBytes(file.content);
      const crc = crc32(data);
      const localHeader = concat([
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(now.dosTime),
        u16(now.dosDate),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes
      ]);
      const localFile = concat([localHeader, data]);
      localParts.push(localFile);

      const centralHeader = concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(now.dosTime),
        u16(now.dosDate),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes
      ]);
      centralParts.push(centralHeader);
      offset += localFile.length;
    }

    const centralDirectory = concat(centralParts);
    const localFiles = concat(localParts);
    const endOfCentralDirectory = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDirectory.length),
      u32(localFiles.length),
      u16(0)
    ]);

    return concat([localFiles, centralDirectory, endOfCentralDirectory]);
  }

  function buildWorkbookBlob(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const files = [
      { name: "[Content_Types].xml", content: contentTypesXml() },
      { name: "_rels/.rels", content: rootRelsXml() },
      { name: "docProps/app.xml", content: appXml() },
      { name: "docProps/core.xml", content: coreXml() },
      { name: "xl/workbook.xml", content: workbookXml() },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml() },
      { name: "xl/styles.xml", content: stylesXml() },
      { name: "xl/worksheets/sheet1.xml", content: worksheetXml(safeRows) }
    ];
    const zipped = zipStore(files);
    return new Blob([zipped], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function timestampForFile(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes())
    ].join("");
  }

  function downloadRows(rows, filename = "") {
    const blob = buildWorkbookBlob(rows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `sinta-jurnal-${timestampForFile()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  globalThis.SintaXlsx = {
    HEADERS,
    buildWorkbookBlob,
    downloadRows,
    getHeaders,
    normalizeNumber,
    timestampForFile
  };
})();
