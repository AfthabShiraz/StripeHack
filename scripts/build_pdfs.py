#!/usr/bin/env python3
"""Build source-only PDF corpora. Never reads data/answer_key. Requires macOS + Swift + Poppler."""
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data_src'
OUT = ROOT / 'data'
CLAIM = 'CLM-2026-004817'

def plain(s):
    s = re.sub(r'\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*', r'\1', s)
    s = re.sub(r'(?<!\w)\*([^*\n]+)\*(?!\w)', r'\1', s)
    s = re.sub(r'</?small>', '', s)
    s = re.sub(r'^>\s?', '', s)
    return s.replace('`', '')

def blocks(text, mono=False):
    if mono:
        # Preserve receipt spacing and wording exactly, while allowing page breaks by line.
        return [dict(kind='mono', text=line) for line in text.splitlines() if line.strip()]
    result=[]; lines=text.splitlines(); i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line or line=='---': i+=1; continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[plain(x.strip()) for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x) for x in cells): rows.append(cells)
                i+=1
            result.append(dict(kind='table',rows=rows)); continue
        result.append(dict(kind='heading' if line.startswith('#') else 'text',text=plain(re.sub(r'^#+\s*','',line))))
        i+=1
    return result

def flatten(obj, prefix=''):
    rows=[]
    if isinstance(obj,dict):
        for k,v in obj.items(): rows+=flatten(v,f'{prefix}.{k}' if prefix else k)
    elif isinstance(obj,list) and obj:
        for i,v in enumerate(obj): rows+=flatten(v,f'{prefix}[{i}]')
    else:
        rows.append([prefix,json.dumps(obj,ensure_ascii=False) if not isinstance(obj,str) else obj])
    return rows

def classify(stem,text,suffix):
    if 'police_report_PSP' in stem:return 'police','POLÍCIA DE SEGURANÇA PÚBLICA'
    if 'receipt' in stem and not 'invoice' in stem:return 'receipt', next((x.strip() for x in text.splitlines() if x.strip() and not x.startswith('#')),'Comprovativo')
    if 'clinic' in stem or 'medical_certificate' in stem:return 'clinic','CLÍNICA MÉDICA SERRA VERDE'
    if 'credit_card_statement' in stem:return 'statement','MERIDIAN BANK | Visa'
    if 'certificate_of_insurance' in stem:return 'certificate','LARKSPUR ASSURANCE'
    if suffix=='.json':return 'system extract','PolicyCore' if 'admin' in stem else 'Larkspur | Claim form submission'
    if suffix=='.csv':return 'rate table','LARKSPUR ASSURANCE | Treasury'
    if re.search(r'\*\*From:',text) or 'email' in stem:return 'email','MAIL | Correspondence printout'
    if 'policy_wording' in stem or 'guidelines' in stem:return 'booklet','LARKSPUR ASSURANCE | Technical publications'
    first=next((plain(re.sub(r'^#+\s*','',line)) for line in text.splitlines() if line.strip()),'Document record')
    return 'document',('LARKSPUR ASSURANCE' if stem[:2].isdigit() else first.split(' — ')[0][:70])

def document(path,output,doc_id,text=None):
    text=path.read_text() if text is None else text
    style,brand=classify(path.stem,text,path.suffix)
    title=next((plain(re.sub(r'^#+\s*','',x)) for x in text.splitlines() if x.strip()),path.stem)
    if style=='email':
        subject=re.search(r'\*\*Subject:\*\*\s*(.+)',text)
        if subject:title=subject[1]
    if path.suffix=='.json':
        title='PolicyCore system extract' if 'admin' in path.stem else 'Claim form submission'
        body=[dict(kind='heading',text=title),dict(kind='table',rows=[['Field','Value']]+flatten(json.loads(text)))]
    elif path.suffix=='.csv':
        comments='\n'.join(x.lstrip('# ') for x in text.splitlines() if x.startswith('#'))
        body=[dict(kind='heading',text='Reference exchange rates'),dict(kind='text',text=comments),dict(kind='table',rows=list(csv.reader(x for x in text.splitlines() if not x.startswith('#'))))]
    else:body=blocks(text,path.suffix=='.txt')
    output.parent.mkdir(parents=True,exist_ok=True)
    dates=re.findall(r'\b(?:20\d\d-\d\d-\d\d|\d\d/\d\d/20\d\d|\d{1,2} Sep(?:tember)? 20\d\d)\b',text)
    return dict(output=str(output),id=doc_id,title=title,style=style,brand=brand,blocks=body,date=dates[0] if dates else None,language='pt' if doc_id=='E12' or style=='receipt' else ('pt/en' if doc_id=='E16' else 'en'))

def main():
    docs=[]; company=[]; claim=[]
    for p in sorted((SRC/'company').rglob('*')):
        if p.suffix not in ('.md','.txt','.json','.csv'):continue
        dest=OUT/'company'/p.relative_to(SRC/'company').with_suffix('.pdf')
        ids={'01':'WORDING-2026','02':'WORDING-2024','03':'CHG-TRV','04':'SAP-01','05':'FRD-03','06':'FX-REF','07':'LTR-02','08':'BROCHURE'}
        doc_id='CERT' if 'certificate' in p.stem else ('ADMIN' if 'admin_record' in p.stem else ids.get(p.stem[:2],p.stem[:2]))
        d=document(p,dest,doc_id);docs.append(d);company.append(d)
        if p.suffix in ('.json','.csv'):shutil.copyfile(p,dest.with_suffix(p.suffix))
    claim_src=SRC/'claims'/CLAIM
    sources=OUT/'claims'/CLAIM/'sources'
    for p in sorted(claim_src.rglob('*')):
        if p.suffix not in ('.md','.txt','.json'):continue
        if p.name=='02_email_thread.md':
            emails=[x.strip() for x in p.read_text().split('\n---\n') if '**From:**' in x]
            for n,mail in enumerate(emails,1):
                name=f'M{n:02d}_email_thread_{n:02d}.pdf'
                d=document(p,sources/name,f'M{n:02d}',p.read_text().split('\n---\n')[0].strip()+'\n\n'+mail);docs.append(d);claim.append(d)
        elif p.stem.startswith('E18_'):
            parts=re.split(r'(?=### RECEIPT [12] )',p.read_text())
            parts=[x.strip() for x in parts if x.strip()]
            assert len(parts)==2
            for suffix,part in zip(('a','b'),parts):
                name=p.stem.replace('E18_',f'E18{suffix}_')+'.pdf'
                d=document(p,sources/name,'E18'+suffix,part);docs.append(d);claim.append(d)
        else:
            doc_id=p.stem.split('_')[0]
            d=document(p,sources/(p.stem+'.pdf'),doc_id);docs.append(d);claim.append(d)
            if p.suffix=='.json':shutil.copyfile(p,sources.parent/'claim_form.json')
    with tempfile.TemporaryDirectory(prefix='larkspur-pdfs-') as tmp:
        jobs=Path(tmp)/'jobs.json';jobs.write_text(json.dumps(docs,ensure_ascii=False))
        env=dict(os.environ,CLANG_MODULE_CACHE_PATH=str(ROOT/'.build'/'module-cache'))
        subprocess.run(['swift',str(ROOT/'scripts/pdf_renderer.swift'),str(jobs)],check=True,env=env)
    # Core Graphics adds timestamps and random trailer IDs. Normalize those volatile fields
    # in-place without changing byte offsets or the PDF cross-reference table.
    for d in docs:
        p=Path(d['output']);raw=p.read_bytes()
        raw=re.sub(rb'D:\d{14}Z',b'D:20260930000000Z',raw)
        raw=re.sub(rb'(<[0-9A-Fa-f]{32}>)(?=\s*<[0-9A-Fa-f]{32}>\s*\])',lambda m:b'<'+hashlib.md5(p.name.encode()).hexdigest().encode()+b'>',raw)
        raw=re.sub(rb'(?<=\s)<[0-9A-Fa-f]{32}>(?=\s*\])',lambda m:b'<'+hashlib.md5(p.name.encode()).hexdigest().encode()+b'>',raw)
        p.write_bytes(raw)
    for items,dest in ((company,OUT/'company/manifest.json'),(claim,sources.parent/'manifest.json')):
        records=[]
        for d in items:
            p=Path(d['output'])
            info=subprocess.check_output(['pdfinfo',str(p)],text=True)
            record=dict(doc_id=d['id'],filename=p.name,path=p.relative_to(ROOT).as_posix(),title=d['title'],doc_type=d['style'],date=d['date'],pages=int(re.search(r'Pages:\s+(\d+)',info)[1]),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),language=d['language'])
            if items is company:
                current=d['id']=='WORDING-2026';old=d['id']=='WORDING-2024'
                record.update(wording_version='TRV-2026 v1' if current else ('TRV-2024 v3' if old else None),effective_date='2026-01-01' if current else ('2024-01-01' if old else None),superseded=old)
            records.append(record)
        dest.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(company)} company PDFs and {len(claim)} claim PDFs.')

if __name__=='__main__':main()
