import * as XLSX from 'xlsx';
import type { DomainItem } from '../types';

export function formatExportRows(items: DomainItem[]): Array<Record<string, any>> {
  // CRITICAL: Always preserve original input order by originalIndex!
  const sorted = [...items].sort((a, b) => a.originalIndex - b.originalIndex);

  return sorted.map((item) => ({
    '#': item.originalIndex,
    'Domain': item.domain,
    'Registered On': item.whois?.registeredOn || 'N/A',
    'Updated On': item.whois?.updatedOn || 'N/A',
    'Expires On': item.whois?.expiresOn || 'N/A',
    'Registrar': item.whois?.registrar || 'N/A',
    'SSL': item.ssl?.status || 'UNKNOWN',
    'SSL Reason': item.ssl?.reason || '',
    'SSL Issuer': item.ssl?.issuer || 'N/A',
    'SSL Expiry': item.ssl?.validTo || 'N/A',
    'Days Until Expiry': item.ssl?.daysRemaining !== undefined ? item.ssl.daysRemaining : 'N/A',
    'Website': item.website?.status || 'UNKNOWN',
    'Website Reason': item.website?.reason || '',
    'Final URL': item.website?.finalUrl || `https://${item.domain}`,
    'HTTP Status': item.website?.statusCode ?? 'N/A',
    'Load Time (ms)': item.website?.loadTimeMs || 0,
    'Completed At': item.completedAt || 'In progress'
  }));
}

export function downloadCsv(items: DomainItem[]) {
  const data = formatExportRows(items);
  if (data.length === 0) {
    const emptyContent = '#,Domain,Registered On,Updated On,Expires On,Registrar,SSL,SSL Reason,SSL Issuer,SSL Expiry,Days Until Expiry,Website,Website Reason,Final URL,HTTP Status,Load Time (ms),Completed At\n';
    triggerDownload(emptyContent, `domain-inspector-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
    return;
  }

  const headers = Object.keys(data[0]);
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(escapeCsv).join(',');
  const rows = data.map((row) => headers.map((h) => escapeCsv(row[h])).join(','));
  const csvContent = [headerLine, ...rows].join('\r\n');

  triggerDownload(csvContent, `domain-inspector-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
}

export function downloadExcel(items: DomainItem[]) {
  const data = formatExportRows(items);
  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet['!cols'] = [
    { wch: 4 },  // #
    { wch: 25 }, // Domain
    { wch: 14 }, // Registered On
    { wch: 14 }, // Updated On
    { wch: 14 }, // Expires On
    { wch: 22 }, // Registrar
    { wch: 10 }, // SSL
    { wch: 36 }, // SSL Reason
    { wch: 26 }, // SSL Issuer
    { wch: 14 }, // SSL Expiry
    { wch: 18 }, // Days Until Expiry
    { wch: 10 }, // Website
    { wch: 38 }, // Website Reason
    { wch: 30 }, // Final URL
    { wch: 12 }, // HTTP Status
    { wch: 14 }, // Load Time (ms)
    { wch: 22 }  // Completed At
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Domain Inspection');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  triggerDownload(blob, `domain-inspector-${new Date().toISOString().split('T')[0]}.xlsx`);
}

function triggerDownload(content: string | Blob, filename: string, mimeType?: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType || 'text/plain' }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
