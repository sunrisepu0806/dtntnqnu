const headerNames = new Set(['mssv','msv','masv','masosv','masinhvien','masosinhvien','studentid','studentcode']);

function isIdHeader(value) {
  const plain = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  return headerNames.has(plain.replace(/^[\d.()\s]+/,'').replace(/[^a-z0-9]/g,''));
}

export function idsFromPaste(text) {
  const lines = text.replace(/^\uFEFF/,'').split(/\r\n|[\r\n]/).filter(line=>line.trim());
  if (!lines.length) throw Error('Hãy dán cột MSSV hoặc chọn tệp danh sách.');
  const cells = lines.map(line=>line.split('\t').map(value=>value.trim()));
  const header = cells.findIndex(row=>row.some(isIdHeader));
  if (header !== -1 && cells[header].length > 1) {
    const fields = cells[header].map((name,index)=>isIdHeader(name)?index:-1).filter(index=>index!==-1);
    if (fields.length !== 1) throw Error('Bảng có nhiều cột MSSV. Hãy dán riêng cột cần dùng.');
    return cells.slice(header+1).map(row=>row[fields[0]] || '');
  }
  if (cells.length>1 && cells.some(row=>row.filter(Boolean).length>1)) {
    throw Error('Bảng có nhiều cột. Hãy sao chép riêng cột MSSV hoặc tải tệp để chọn cột.');
  }
  return lines.filter(line=>!isIdHeader(line)).flatMap(line=>{
    const parts=line.trim().split(/[\s,;]+/).filter(Boolean);
    return parts;
  });
}

function cellLabel(cell, XLSX) {
  const formatted=String(cell.w ?? XLSX.utils.format_cell(cell)).trim();
  if (cell.t!=='n') return formatted;
  if (Number.isInteger(cell.v) && cell.v>=1e15) return 'Số thiếu độ chính xác trong Excel';
  if (Number.isSafeInteger(cell.v) && cell.v>=0) {
    if (/^0\d+$/.test(formatted) && Number(formatted)===cell.v) return formatted;
    return String(cell.v);
  }
  return formatted;
}

function sheetTable(sheet, XLSX) {
  const records=new Map(), used=new Set();
  for (const [address,cell] of Object.entries(sheet)) {
    if (address[0]==='!' || cell.v==null) continue;
    const label=cellLabel(cell,XLSX);
    if (!label) continue;
    const {r,c}=XLSX.utils.decode_cell(address);
    if (!records.has(r)) records.set(r,new Map());
    records.get(r).set(c,label);
    used.add(c);
  }
  const rows=[...records.keys()].sort((a,b)=>a-b).map(r=>records.get(r));
  const headerIndex=rows.findIndex(row=>[...row.values()].some(isIdHeader));
  const header=rows[headerIndex];
  const matches=header ? [...header].filter(([,label])=>isIdHeader(label)) : [];
  const columns=[...used].sort((a,b)=>a-b).map(id=>{
    const sample=header?.get(id) || rows[0]?.get(id) || '';
    return {id, label:'Cột '+XLSX.utils.encode_col(id)+(sample?' · '+sample.slice(0,55):'')};
  });
  const column=matches.length===1 ? matches[0][0] : columns.length===1 ? columns[0].id : null;
  return {columns,column,hasHeader:headerIndex>=0,ids:col=>rows.slice(headerIndex+1).map(row=>row.get(col) || '')};
}

export async function readFundFile(file) {
  const extension=file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx','xls','csv'].includes(extension)) throw Error('Hãy chọn tệp Excel (.xlsx, .xls) hoặc CSV.');
  const XLSX=await import('xlsx');
  let book;
  try {
    book=extension==='csv'
      ? XLSX.read(await file.text(),{type:'string',raw:true})
      : XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,cellNF:true});
  } catch {
    throw Error('Không đọc được bảng tính. Hãy kiểm tra định dạng tệp hoặc dán cột MSSV.');
  }
  const sheets=book.SheetNames.filter((_,index)=>!book.Workbook?.Sheets?.[index]?.Hidden)
    .map(name=>({name,...sheetTable(book.Sheets[name],XLSX)})).filter(sheet=>sheet.columns.length);
  if (!sheets.length) throw Error('Tệp chưa có dữ liệu để nhập.');
  const detected=sheets.findIndex(sheet=>sheet.hasHeader);
  return {name:file.name,sheets,index:Math.max(0,detected)};
}
