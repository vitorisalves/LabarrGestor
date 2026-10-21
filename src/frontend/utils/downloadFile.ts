/** Baixa um arquivo gerado no navegador (substitui XLSX.writeFile). */
export function downloadArrayBuffer(buffer: ArrayBuffer, fileName: string, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
