import * as XLSX from 'xlsx';

// CSV Export Service - works on all data tables
export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Excel (XLSX) Export Service — title row as H2 headline (merged & bold), styled headers
export function exportExcel(
  filename: string,
  title: string,
  headers: string[],
  rows: string[][]
) {
  // Build sheet data: [title row] + [header row] + [data rows]
  const data: (string | null)[][] = [
    [title],          // Row 0 — H2 title
    headers,          // Row 1 — column headers
    ...rows,          // Row 2+ — data
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Merge title row across all columns (H2 headline spanning full width)
  if (headers.length > 1) {
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  }

  // Give the H2 title row extra height (28pt) for visual prominence
  ws['!rows'] = [{ hpt: 28 }];

  // Style title cell (A1) as H2 — bold, 14pt, centered
  const titleCell = ws['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 14, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
    };
  }

  // Style header row (row 2) — bold, 11pt, with light blue fill
  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 1, c });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        font: { bold: true, sz: 11, name: 'Calibri' },
        fill: { fgColor: { rgb: 'D9E2F3' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    }
  }

  // Auto-column widths based on header + data content
  ws['!cols'] = headers.map((h, i) => {
    const dataMax = rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), 0);
    const w = Math.max(h.length, Math.min(dataMax, 40)) + 4;
    return { wch: w };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  // Browser-compatible download
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Format helpers
export function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}
export function num(v: number | null | undefined, decimals = 4): string {
  return (v ?? 0).toFixed(decimals);
}
