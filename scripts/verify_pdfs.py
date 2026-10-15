#!/usr/bin/env python3
"""Check corpus integrity, full block text, manifests, evaluation isolation and preview pages."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
from build_pdfs import ROOT, SRC, OUT, CLAIM, blocks, flatten

def norm(text):
    return ''.join(unicodedata.normalize('NFKC',text).replace('\ufe0f','').split())

def main():
    manifests=[OUT/'company/manifest.json',OUT/'claims'/CLAIM/'manifest.json']
    records=sum([json.loads(p.read_text()) for p in manifests],[])
    pdfs=sorted(OUT.rglob('*.pdf'))
    assert len(pdfs)==len(records)
    texts={}
    for record in records:
        p=ROOT/record['path']
        assert p.name==record['filename']
        assert hashlib.sha256(p.read_bytes()).hexdigest()==record['sha256']
        text=subprocess.check_output(['pdftotext','-raw',str(p),'-'],text=True)
        assert text.strip(),p
        assert '\ufffd' not in text and '\u25a1' not in text,p
        texts[record['doc_id']]=text
    spots={'E12':['sem vigilância','40 (quarenta) metros'], 'E05':['19:20'], 'E06':['FE-2026-118734','Protetor solar'], 'WORDING-2026':['TRV-2026 v1'], 'CERT':['Gadget extension: NOT purchased'], 'E21':['£103.38','****4417']}
    for doc_id,strings in spots.items():
        for s in strings: assert norm(s) in norm(texts[doc_id]),(doc_id,s)
    # Verify every parsed text block/table cell survives; source files stay byte-identical.
    from build_pdfs import plain
    for p in sorted(SRC.rglob('*')):
        if p.suffix not in ('.md','.txt','.json','.csv') or p.name=='README.md' or p.name=='noise_catalogue.json':continue
        if 'company' in p.parts:
            target=OUT/'company'/p.relative_to(SRC/'company').with_suffix('.pdf')
            actual=subprocess.check_output(['pdftotext','-raw',str(target),'-'],text=True)
        elif p.stem=='02_email_thread':actual='\n'.join(texts[f'M{i:02d}'] for i in range(1,4))
        elif p.stem.startswith('E18_'):actual=texts['E18a']+'\n'+texts['E18b']
        else:actual=texts[p.stem.split('_')[0]]
        if p.suffix=='.json':expected=[cell for row in flatten(json.loads(p.read_text())) for cell in row]
        elif p.suffix=='.csv':expected=[line.lstrip('# ') for line in p.read_text().splitlines() if line.startswith('#')];expected+=[cell for line in p.read_text().splitlines() if not line.startswith('#') for cell in line.split(',')]
        else:
            expected=[]
            for b in blocks(p.read_text(),p.suffix=='.txt'):
                expected+=([cell for row in b['rows'] for cell in row] if b['kind']=='table' else [b['text']])
        for s in expected:
            assert norm(s) in norm(actual),(p.name,s)
    key=json.loads((OUT/'answer_key'/f'{CLAIM}_expected_outcome.json').read_text())
    assert key['net_payable_gbp']==390.20 and key['payment']['amount_gbp']==390.20
    assert '**£390.20**' in (OUT/'answer_key'/f'{CLAIM}_expected_outcome.md').read_text()
    forbidden=['ANSWER KEY','net_payable_gbp','Common wrong answers','failed_preconditions','£390.20','irrelevant_documents']
    for doc_id,text in texts.items():
        for s in forbidden:assert s not in text,(doc_id,s)
    # Compare all pre-existing generator inputs with initial git versions.
    tracked=subprocess.check_output(['git','ls-tree','-r','--name-only','HEAD','data/company','data/claims'],cwd=ROOT,text=True).splitlines()
    for name in tracked:
        original=subprocess.check_output(['git','show',f'HEAD:{name}'],cwd=ROOT)
        assert (ROOT/name.replace('data/','data_src/',1)).read_bytes()==original,name
    preview=ROOT/'.build/previews';preview.mkdir(parents=True,exist_ok=True)
    for doc_id in ['E06','WORDING-2026','E12','M02','E21']:
        record=next(r for r in records if r['doc_id']==doc_id)
        subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','1400','-png',str(ROOT/record['path']),str(preview/doc_id)],check=True)
    report=dict(company_pdfs=len(json.loads(manifests[0].read_text())),claim_pdfs=len(json.loads(manifests[1].read_text())),total_pages=sum(r['pages'] for r in records),nonempty_text=len(texts),source_content='all parsed blocks/cells survived extraction; original inputs byte-identical to HEAD',key_strings='all passed',net_payable_gbp=key['net_payable_gbp'],answer_key_isolation='passed',previews=str(preview.relative_to(ROOT)))
    (ROOT/'.build/verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
