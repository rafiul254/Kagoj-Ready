"""Synthetic diagnostic cards, NOT replicas of official documents. No personal data."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import json, hashlib
ROOT=Path(__file__).resolve().parents[1]
FONT=str(ROOT/'public/fonts/NotoSansBengali.ttf')
def font(n): return ImageFont.truetype(FONT,n)
base=dict(name_bn='নমুনা মেঘলা',name_en='Namuna Meghla',father_name='Kalpo Niloy',mother_name='Kalpo Jonaki',date_of_birth='1998-04-12',id_number='SAMPLE-000001',address='12 Fiction Lane, Sample Town',issue_date='2022-01-15')
cards=[
 ('baseline','nid','Baseline / exact fields',{},None),
 ('format','birth_certificate','Exact + format-only pair',{'name_en':'Namuna   Meghla','address':'12 Fiction Lane , Sample Town'},None),
 ('variant','birth_certificate','Bangla–English parent-name variant',{'father_name':'কল্প নিলয়'},None),
 ('parent','birth_certificate','Parent-name conflict',{'mother_name':'Kalpo Tara'},None),
 ('dob','birth_certificate','Date-of-birth conflict',{'date_of_birth':'1999-04-12'},None),
 ('missing','birth_certificate','Missing mother’s name',{'mother_name':None},None),
 ('blurry','nid','Unreadable image',{},'blurry'),
 ('wrong','other','Wrong document',{},'wrong_document')
]
fixtures=[]
for key,kind,title,changes,reject in cards:
 fields=base|changes
 image=Image.new('RGB',(1400,1040),'#f7faf8'); d=ImageDraw.Draw(image)
 d.rounded_rectangle((28,28,1372,1012),radius=24,outline='#a7beb0',width=3)
 d.text((64,48),'SAMPLE / নমুনা — NOT VALID',font=font(38),fill='#a53535')
 d.text((64,112),'SYNTHETIC '+kind.upper().replace('_',' ')+' TEST CARD',font=font(30),fill='#174b36')
 d.text((64,158),'Fictional data only. Not an official document design.',font=font(22),fill='#596c62')
 if key=='wrong':
  d.text((64,285),'SAMPLE GROCERY RECEIPT',font=font(48),fill='#334b3e')
  d.text((64,380),'Mango x 2     DEMO ONLY',font=font(34),fill='#334b3e')
  d.text((64,485),'No identity fields. Wrong document for this test.',font=font(27),fill='#334b3e')
  fields={k:None for k in base}
 else:
  for i,(k,v) in enumerate(fields.items()):
   y=237+i*80
   d.text((66,y),k,font=font(25),fill='#62786b')
   if v is not None:d.text((375,y-3),v,font=font(32),fill='#152e20')
   else:d.line((375,y+33,950,y+33),fill='#c5d5cb',width=2)
  if key=='blurry': image=image.filter(ImageFilter.GaussianBlur(17))
 # Always preserve legible SAMPLE watermark, including the blurred fixture.
 d=ImageDraw.Draw(image);d.rectangle((40,924,1360,995),fill='#e3ebe5')
 d.text((67,938),'SAMPLE · FICTIONAL · NO LEGAL VALIDITY',font=font(29),fill='#9a3434')
 path=ROOT/f'public/samples/{key}.png'; image.save(path)
 fixtures.append({'id':key,'file':f'/samples/{key}.png','title':title,'documentType':kind,'expectedRejection':reject,'fields':fields,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
manifest={'version':1,'synthetic':True,'description':'Eight diagnostic cards; fictional names, explicit SAMPLE watermark. Not government document templates. Baseline versus format provides exact matches and format-only differences in the same pair.','context':{'ageBand':'20_plus','applicationType':'first_time','location':'bangladesh'},'fixtures':fixtures,'conflicts':[
 {'left':'baseline','right':'format','field':'name_bn','expected':'match'},
 {'left':'baseline','right':'format','field':'name_en','expected':'format_difference'},
 {'left':'baseline','right':'format','field':'address','expected':'format_difference'},
 {'left':'baseline','right':'variant','field':'father_name','expected':'possible_variation'},
 {'left':'baseline','right':'parent','field':'mother_name','expected':'possible_discrepancy'},
 {'left':'baseline','right':'dob','field':'date_of_birth','expected':'possible_discrepancy'},
 {'left':'baseline','right':'missing','field':'mother_name','expected':'missing'}]}
(ROOT/'src/data/samples.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Created {len(fixtures)} SAMPLE images and ground truth.')
