export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? "").replace(/"/g, '""');
        return `"${val}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPrintPDF(title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const tableEl = document.querySelector("[data-export-table]");
  if (!tableEl) return;
  printWindow.document.write(`
    <html><head><title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; }
      h1 { font-size: 18px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #1E3A5F; color: white; }
      tr:nth-child(even) { background: #f9f9f9; }
    </style></head><body>
    <h1>${title}</h1>
    ${tableEl.outerHTML}
    <script>window.print();window.close();</script>
    </body></html>
  `);
  printWindow.document.close();
}
