const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = process.cwd();
const FOOD_CANDS = [
  'C:/Users/yurar/Downloads/Food_Master_Japan2023_IndexBased.xlsx',
  path.resolve(ROOT, 'Food_Master_Japan2023_IndexBased.xlsx'),
  path.resolve(ROOT, 'source_japan2023.xlsx'),
  path.resolve(ROOT, 'food_source.xlsx'),
];
const RET_CANDS = [
  'C:/Users/yurar/Downloads/Retention_Table_Design_Japan2023.xlsx',
  path.resolve(ROOT, 'Retention_Table_Design_Japan2023.xlsx'),
];
const OUT_XLSX = path.resolve(ROOT, 'recipe_db_ramen_50.xlsx');
const OUT_REPORT = path.resolve(ROOT, 'ramen_generation_report.json');
const TARGET = 50;
const MAX_RETRY = 3;

const NKEYS = ['kcal','protein','fat','carb','calcium','iron','vitaminB1','vitaminB2','vitaminB6','vitaminB12','vitaminC','vitaminD','rae','salt'];
const IRRITANTS = ['にんにく','ラー油','唐辛子','こしょう','辛味'];

const norm = (v) => String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[・･()（）\[\]{}\-_,.]/g,'');
const n = (v) => {
  const s = String(v ?? '').trim();
  if (!s || s==='-' || /^tr$/i.test(s) || /^\(tr\)$/i.test(s)) return 0;
  const x = Number(s.replace(/,/g,'').replace(/[()]/g,''));
  return Number.isFinite(x) ? x : 0;
};
const hasNA = (v) => typeof v === 'string' && /#N\/A|#REF!|#VALUE!/i.test(v);
const empty = () => ({kcal:0,protein:0,fat:0,carb:0,calcium:0,iron:0,vitaminB1:0,vitaminB2:0,vitaminB6:0,vitaminB12:0,vitaminC:0,vitaminD:0,rae:0,salt:0});
const sumN = (arr) => arr.reduce((a,b)=>{for(const k of NKEYS)a[k]+=b[k]||0;return a;}, empty());
const roundN = (x) => { const o={...x}; for(const k of NKEYS) o[k]=Number((o[k]||0).toFixed(3)); return o; };
const pickFile = (cands,label)=>{ for(const c of cands) if(fs.existsSync(c)) return c; throw new Error(`missing ${label}`); };

function readFoods(file){
  const wb=XLSX.readFile(file,{cellText:true,cellDates:false});
  const ws=wb.Sheets['Food_Master_Numeric']||wb.Sheets['表全体']||wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  const foods=rows.map(r=>({
    foodNo:String(r.Food_No||r['食品番号']||'').trim().replace(/^0+/,''),
    foodName:String(r.Food_Name||r['食品名']||'').trim(),
    refusePercent:n(r.REFUSE||r['廃棄率']),
    kcal:n(r.ENERC_KCAL), protein:n(r['PROT-']), fat:n(r['FAT-']), carb:n(r['CHOCDF-']),
    calcium:n(r.CA), iron:n(r.FE), vitaminB1:n(r.THIA), vitaminB2:n(r.RIBF), vitaminB6:n(r.VITB6A), vitaminB12:n(r.VITB12), vitaminC:n(r.VITC), vitaminD:n(r.VITD), rae:n(r.VITA_RAE), salt:n(r.NACL_EQ),
  })).filter(f=>f.foodNo&&f.foodName);
  if(!foods.length) throw new Error('foods empty');
  return foods;
}

function readYieldRetention(file){
  const wb=XLSX.readFile(file,{cellText:true,cellDates:false});
  const y=wb.Sheets['Yield_Table']; const r=wb.Sheets['Retention_Table'];
  if(!y||!r) throw new Error('Yield/Retention sheet missing');
  const yRows=XLSX.utils.sheet_to_json(y,{defval:''});
  const rRows=XLSX.utils.sheet_to_json(r,{defval:''});
  const yMap=new Map();
  for(const row of yRows){
    const fid=String(row.Food_ID||'').trim().replace(/^0+/,'');
    const p=String(row.Process||'').trim().toUpperCase();
    const rate=n(row.Yield_Rate); if(fid&&p&&rate>0) yMap.set(`${fid}|${p}`,rate);
  }
  const map={Energy:'kcal',Protein:'protein',Fat:'fat',Carbohydrate:'carb',Calcium:'calcium',Iron:'iron',Vitamin_B1:'vitaminB1',Vitamin_B2:'vitaminB2',Vitamin_B6:'vitaminB6',Vitamin_B12:'vitaminB12',Vitamin_C:'vitaminC',Vitamin_D:'vitaminD','Retinol Activity Equivalents':'rae',solt:'salt',Salt:'salt'};
  const rMap=new Map();
  for(const row of rRows){
    const fid=String(row.Food_ID||'').trim().replace(/^0+/,'');
    const p=String(row.Process||'').trim().toUpperCase();
    const key=map[String(row.Nutrient||'').trim()]; if(!fid||!p||!key) continue;
    const rate=n(row.Retention_Rate); const k=`${fid}|${p}`; const o=rMap.get(k)||empty(); o[key]=rate>0?rate:1; rMap.set(k,o);
  }
  for(const [k,o] of rMap.entries()){ for(const nk of NKEYS) if(!(o[nk]>0)) o[nk]=1; rMap.set(k,o); }
  const yDef={main:1,protein:1,vegetable:1,seasoning:1};
  const rDef={boil:{...empty(),kcal:1,protein:1,fat:1,carb:1,calcium:1,iron:1,vitaminB1:1,vitaminB2:1,vitaminB6:1,vitaminB12:1,vitaminC:1,vitaminD:1,rae:1,salt:1},stirFry:{...empty(),kcal:1,protein:1,fat:1,carb:1,calcium:1,iron:1,vitaminB1:1,vitaminB2:1,vitaminB6:1,vitaminB12:1,vitaminC:1,vitaminD:1,rae:1,salt:1},simmer:{...empty(),kcal:1,protein:1,fat:1,carb:1,calcium:1,iron:1,vitaminB1:1,vitaminB2:1,vitaminB6:1,vitaminB12:1,vitaminC:1,vitaminD:1,rae:1,salt:1},grill:{...empty(),kcal:1,protein:1,fat:1,carb:1,calcium:1,iron:1,vitaminB1:1,vitaminB2:1,vitaminB6:1,vitaminB12:1,vitaminC:1,vitaminD:1,rae:1,salt:1}};
  return {yMap,rMap,yDef,rDef};
}

function pickFood(foods,tokens){
  const nt=tokens.map(norm).filter(Boolean);
  const hit=foods.find(f=>nt.every(t=>norm(f.foodName).includes(t)));
  if(!hit) throw new Error('food token not found: '+tokens.join('+'));
  return hit.foodName;
}
function findFoodByName(foods,q){
  const nq=norm(q); if(!nq) return null;
  const exact=foods.find(f=>norm(f.foodName)===nq); if(exact) return exact;
  const hits=foods.filter(f=>norm(f.foodName).includes(nq)||nq.includes(norm(f.foodName)));
  return hits[0]||null;
}

function makePantry(foods){
  return {
    ramenNoodle: pickFood(foods,['中華めん','生']),
    ramenSoupShoyu: pickFood(foods,['ラーメンスープ','しょうゆ味']),
    ramenSoupMiso: pickFood(foods,['ラーメンスープ','みそ味']),
    soySauce: pickFood(foods,['しょうゆ類','こいくちしょうゆ']),
    salt: pickFood(foods,['食塩類','食塩']),
    chickenStock: pickFood(foods,['鶏がらだし']),
    misoLight: pickFood(foods,['米みそ','淡色辛みそ']),
    sesamePaste: pickFood(foods,['ごま','ねり']),
    sesameOil: pickFood(foods,['ごま油']),
    rayu: pickFood(foods,['ラー油']),
    chickenBreast: pickFood(foods,['にわとり','むね','皮なし','生']),
    chickenThigh: pickFood(foods,['にわとり','もも','皮なし','生']),
    porkBelly: pickFood(foods,['ぶた','ばら','脂身つき','生']),
    roastPork: pickFood(foods,['焼き豚']),
    porkMince: pickFood(foods,['ぶた','ひき肉','生']),
    chickenMince: pickFood(foods,['にわとり','ひき肉','生']),
    eggBoiled: pickFood(foods,['鶏卵','全卵','ゆで']),
    moyashiBoiled: pickFood(foods,['りょくとうもやし','ゆで']),
    negiGreen: pickFood(foods,['こねぎ','葉','生']),
    negiWhite: pickFood(foods,['根深ねぎ','軟白','生']),
    spinachBoiled: pickFood(foods,['ほうれんそう','ゆで']),
    cabbageBoiled: pickFood(foods,['キャベツ','結球葉','ゆで']),
    gingerGrated: pickFood(foods,['しょうが','おろし']),
    wakame: pickFood(foods,['カットわかめ','水煮']),
    nori: pickFood(foods,['あまのり','焼きのり']),
    corn: pickFood(foods,['スイートコーン','缶詰','ホールカーネル']),
    kikurage: pickFood(foods,['きくらげ','ゆで']),
    naruto: pickFood(foods,['なると']),
    milk: pickFood(foods,['普通牛乳']),
    soyMilk: pickFood(foods,['豆乳','豆乳']),
  };
}

const methodProfile={茹で:'boil',煮る:'simmer'};
const processCode={茹で:'BOIL',煮る:'SIMMER'};

const rowOf=(id,it)=>({Recipe_ID:id,Ingredient_Name:it.name,'Weight(g)':Number(it.w.toFixed(1)),Notes:`${it.g} / ${it.food}`});
const groupOf=(notes)=>{const k=String(notes).split('/')[0].trim();return ['main','protein','vegetable','seasoning'].includes(k)?k:'vegetable';};

function scale(food,rawW,group,yDef,ret){
  const edible=Math.max(0,Math.min(1,(100-food.refusePercent)/100));
  const finalW=rawW*edible*yDef[group];
  const o=empty(); for(const k of NKEYS) o[k]=(food[k]*finalW*ret[k])/100; return o;
}

function tagsFrom(total,digestible,hasIrr){
  const t=[];
  if(total.protein>=20) t.push('高たんぱく');
  if(total.fat<10) t.push('低脂質');
  if(total.carb>=70) t.push('高炭水化物');
  if(total.fat<10&&digestible&&!hasIrr) t.push('試合前');
  if(total.protein>=20&&total.carb>=70) t.push('試合後');
  if(total.kcal>=650||total.fat>=20) t.push('増量期');
  if(total.protein>=20&&total.fat<10) t.push('減量期');
  return [...new Set(t)];
}

function calcRecipe(spec,rows,foods,yDef,rDef,yMap,rMap){
  const m=methodProfile[spec.method]; const pc=processCode[spec.method]||'RAW';
  const calcRows=[];
  for(const row of rows){
    if(hasNA(row.Recipe_ID)||hasNA(row.Ingredient_Name)||hasNA(row['Weight(g)'])||hasNA(row.Notes)) throw new Error('NA in ingredients '+spec.id);
    const w=n(row['Weight(g)']); if(!(w>0)) throw new Error('bad weight '+spec.id);
    const hint=String(row.Notes).split('/').slice(-1)[0].trim();
    const food=findFoodByName(foods,hint)||findFoodByName(foods,row.Ingredient_Name);
    if(!food) throw new Error('food unresolved '+spec.id+' '+row.Ingredient_Name);
    const g=groupOf(row.Notes); const oy=yMap.get(`${food.foodNo}|${pc}`);
    const yUse={...yDef,[g]:oy&&oy>0?oy:yDef[g]};
    const ret=rMap.get(`${food.foodNo}|${pc}`)||rDef[m];
    const contrib=scale(food,w,g,yUse,ret);
    const irr=IRRITANTS.some(t=>`${row.Ingredient_Name} ${food.foodName}`.includes(t));
    calcRows.push({...row,mappedFoodNo:food.foodNo,mappedFoodName:food.foodName,g,contrib,irr});
  }
  const total=roundN(sumN(calcRows.map(x=>x.contrib)));
  const pe=total.protein*4, fe=total.fat*9, ce=total.carb*4, den=Math.max(1,pe+fe+ce);
  const pRatio=Number(((pe/den)*100).toFixed(1)), fRatio=Number(((fe/den)*100).toFixed(1)), cRatio=Number(((ce/den)*100).toFixed(1));
  const digestible=spec.method==='茹で'||spec.method==='煮る';
  const hasIrr=calcRows.some(x=>x.irr);
  const tags=tagsFrom(total,digestible,hasIrr);
  return {total,pRatio,fRatio,cRatio,tags,hasIrr};
}

function scaleW(row,ratio,min=0.2){ row['Weight(g)']=Number(Math.max(min,n(row['Weight(g)'])*ratio).toFixed(1)); }

function retryAdjust(rows,target,attempt){
  const a=rows.map(r=>({...r}));
  const needP=target.some(t=>['高たんぱく','試合後','減量期'].includes(t));
  const needF=target.some(t=>['低脂質','試合前','減量期'].includes(t));
  const needC=target.some(t=>['高炭水化物','試合後'].includes(t));
  const needB=target.includes('増量期');
  const prs=a.filter(r=>groupOf(r.Notes)==='protein');
  const mns=a.filter(r=>groupOf(r.Notes)==='main');
  const fats=a.filter(r=>/ごま油|ラー油|ばら|焼き豚|ねり/.test(`${r.Ingredient_Name}${r.Notes}`));
  const irs=a.filter(r=>/にんにく|ラー油|こしょう|辛/.test(`${r.Ingredient_Name}${r.Notes}`));
  const pS=[1.16,1.28,1.4][attempt-1]||1.4, cS=[1.08,1.16,1.24][attempt-1]||1.24, fR=[0.75,0.58,0.42][attempt-1]||0.42, bS=[1.1,1.2,1.3][attempt-1]||1.3;
  if(needP) for(const r of prs) scaleW(r,pS,8);
  if(needC) for(const r of mns) scaleW(r,cS,120);
  if(needB) for(const r of [...prs,...mns]) scaleW(r,bS,20);
  if(needF){ for(const r of fats) scaleW(r,fR,0.1); for(const r of irs) scaleW(r,fR,0.1); }
  return a;
}
function makeSpecs(p){
  const order=['醤油','味噌','塩','豚骨','担々風','野菜たっぷり','鶏白湯風'];
  const counts={醤油:8,味噌:7,塩:7,豚骨:7,担々風:7,野菜たっぷり:7,鶏白湯風:7};
  const names={
    醤油:['香味醤油らーめん','生姜醤油らーめん','鶏だし醤油らーめん','ねぎ醤油らーめん','海苔醤油らーめん','わかめ醤油らーめん','コーン醤油らーめん','チャーシュー醤油らーめん'],
    味噌:['定番味噌らーめん','生姜味噌らーめん','野菜味噌らーめん','コーン味噌らーめん','ねぎ味噌らーめん','鶏味噌らーめん','濃厚味噌らーめん'],
    塩:['澄まし塩らーめん','鶏塩らーめん','わかめ塩らーめん','ほうれん草塩らーめん','なると塩らーめん','柚子なし塩らーめん','試合前塩らーめん'],
    豚骨:['豚骨風らーめん','濃いめ豚骨らーめん','豚骨チャーシューらーめん','豚骨きくらげらーめん','豚骨ねぎらーめん','豚骨たまごらーめん','豚骨コーンらーめん'],
    担々風:['担々風らーめん','ごま担々風らーめん','辛味控えめ担々風らーめん','肉味噌担々風らーめん','青ねぎ担々風らーめん','濃厚担々風らーめん','担々風白ごまらーめん'],
    野菜たっぷり:['野菜たっぷりらーめん','もやしたっぷりらーめん','キャベツ野菜らーめん','ほうれん草野菜らーめん','ねぎ野菜らーめん','きくらげ野菜らーめん','減量期野菜らーめん'],
    鶏白湯風:['鶏白湯風らーめん','まろやか鶏白湯風らーめん','鶏白湯風ねぎらーめん','鶏白湯風たまごらーめん','鶏白湯風コーンらーめん','鶏白湯風ほうれん草らーめん','鶏白湯風高たんぱくらーめん'],
  };
  const targets={
    醤油:['高炭水化物'],
    味噌:['高炭水化物','高たんぱく'],
    塩:['低脂質','高炭水化物','試合前'],
    豚骨:['増量期'],
    担々風:['増量期'],
    野菜たっぷり:['高たんぱく','低脂質','高炭水化物','減量期'],
    鶏白湯風:['高たんぱく','高炭水化物','試合後'],
  };
  let idn=1; const specs=[];
  for(const style of order){
    for(let i=0;i<counts[style];i++){
      const id=`RAMEN_${String(idn).padStart(3,'0')}`;
      const nm=names[style][i%names[style].length];
      const noodle=185+i*3;
      const ing=[{g:'main',name:'らーめん',food:p.ramenNoodle,w:noodle}];
      const cVeg=[{g:'vegetable',name:'もやし',food:p.moyashiBoiled,w:45+i*2},{g:'vegetable',name:'こねぎ',food:p.negiGreen,w:14+i}];
      if(style==='醤油') ing.push({g:'seasoning',name:'醤油ラーメンスープ',food:p.ramenSoupShoyu,w:32+i},{g:'seasoning',name:'鶏がらだし',food:p.chickenStock,w:8+i*0.4},{g:'protein',name:'鶏むね肉',food:p.chickenBreast,w:58+i*2},{g:'protein',name:'ゆで卵',food:p.eggBoiled,w:22+i*1.2},...cVeg,{g:'vegetable',name:'焼きのり',food:p.nori,w:1.2});
      else if(style==='味噌') ing.push({g:'seasoning',name:'味噌ラーメンスープ',food:p.ramenSoupMiso,w:34+i},{g:'seasoning',name:'米みそ',food:p.misoLight,w:9+i*0.5},{g:'protein',name:'鶏もも肉',food:p.chickenThigh,w:64+i*2},{g:'protein',name:'ゆで卵',food:p.eggBoiled,w:20+i},...cVeg,{g:'vegetable',name:'コーン',food:p.corn,w:20+i*2});
      else if(style==='塩') ing.push({g:'seasoning',name:'食塩',food:p.salt,w:1.4+i*0.05},{g:'seasoning',name:'鶏がらだし',food:p.chickenStock,w:9+i*0.5},{g:'protein',name:'鶏むね肉',food:p.chickenBreast,w:72+i*2},{g:'vegetable',name:'ほうれん草',food:p.spinachBoiled,w:34+i*2},{g:'vegetable',name:'なると',food:p.naruto,w:18+i},{g:'vegetable',name:'わかめ',food:p.wakame,w:12+i*0.5});
      else if(style==='豚骨') ing.push({g:'seasoning',name:'鶏がらだし',food:p.chickenStock,w:11+i*0.4},{g:'seasoning',name:'こいくちしょうゆ',food:p.soySauce,w:9+i*0.4},{g:'seasoning',name:'ごま油',food:p.sesameOil,w:4.8+i*0.25},{g:'protein',name:'豚ばら肉',food:p.porkBelly,w:52+i*2},{g:'protein',name:'焼き豚',food:p.roastPork,w:30+i*1.5},{g:'protein',name:'ゆで卵',food:p.eggBoiled,w:18+i},{g:'vegetable',name:'きくらげ',food:p.kikurage,w:14+i},{g:'vegetable',name:'白ねぎ',food:p.negiWhite,w:20+i*1.5});
      else if(style==='担々風') ing.push({g:'seasoning',name:'鶏がらだし',food:p.chickenStock,w:10+i*0.4},{g:'seasoning',name:'ごまペースト',food:p.sesamePaste,w:13+i*0.8},{g:'seasoning',name:'ごま油',food:p.sesameOil,w:3.8+i*0.2},{g:'seasoning',name:'ラー油',food:p.rayu,w:2.2+i*0.2},{g:'protein',name:'豚ひき肉',food:p.porkMince,w:44+i*2},{g:'protein',name:'鶏ひき肉',food:p.chickenMince,w:26+i*1.4},{g:'vegetable',name:'こねぎ',food:p.negiGreen,w:16+i},{g:'vegetable',name:'しょうが',food:p.gingerGrated,w:3.5+i*0.2});
      else if(style==='野菜たっぷり') ing.push({g:'seasoning',name:'鶏がらだし',food:p.chickenStock,w:8+i*0.4},{g:'seasoning',name:'食塩',food:p.salt,w:1.2+i*0.05},{g:'protein',name:'鶏むね肉',food:p.chickenBreast,w:86+i*3},{g:'vegetable',name:'もやし',food:p.moyashiBoiled,w:78+i*3},{g:'vegetable',name:'キャベツ',food:p.cabbageBoiled,w:58+i*3},{g:'vegetable',name:'ほうれん草',food:p.spinachBoiled,w:32+i*2},{g:'vegetable',name:'きくらげ',food:p.kikurage,w:18+i},{g:'vegetable',name:'こねぎ',food:p.negiGreen,w:16+i});
      else ing.push({g:'seasoning',name:'鶏がらだし',food:p.chickenStock,w:10+i*0.4},{g:'seasoning',name:'豆乳',food:p.soyMilk,w:88+i*3},{g:'seasoning',name:'普通牛乳',food:p.milk,w:48+i*2},{g:'seasoning',name:'こいくちしょうゆ',food:p.soySauce,w:8+i*0.4},{g:'protein',name:'鶏むね肉',food:p.chickenBreast,w:88+i*2.5},{g:'protein',name:'ゆで卵',food:p.eggBoiled,w:20+i},{g:'vegetable',name:'白ねぎ',food:p.negiWhite,w:20+i},{g:'vegetable',name:'ほうれん草',food:p.spinachBoiled,w:26+i*2});
      if(ing.length<5||ing.length>12) throw new Error('ingredient count out of range '+id);
      specs.push({id,name:nm,soupType:style,method:style==='担々風'?'煮る':'茹で',targetTags:[...targets[style]],ingredients:ing});
      idn++;
    }
  }
  if(specs.length!==TARGET) throw new Error('spec count mismatch '+specs.length);
  return specs;
}

function mkSteps(spec){
  const lines=[
    `具材を切り分け、${spec.ingredients[0].name}を表示重量どおりに計量する。`,
    `${spec.soupType}スープの調味料とだしを合わせ、温度を上げすぎずに加熱する。`,
    `${spec.ingredients[0].name}を${spec.method==='茹で'?'茹で':'煮て'}、具材を順に加えて火を通す。`,
    '器に盛り、最終調整して仕上げる。'
  ];
  return lines.map((x,i)=>({Recipe_ID:spec.id,Step_Number:i+1,Instruction:x}));
}
function main(){
  const foodPath=pickFile(FOOD_CANDS,'food');
  const retPath=pickFile(RET_CANDS,'retention');
  for(const c of [path.resolve(ROOT,'recipe_db_udon_100.xlsx'),path.resolve(ROOT,'recipe_db_gohan_120.xlsx')]){
    if(fs.existsSync(c)){
      const wb=XLSX.readFile(c,{cellText:true,cellDates:false});
      for(const s of ['Ingredients','Steps','Recipe_Master']) if(!wb.SheetNames.includes(s)) throw new Error('compat sheet missing '+s);
    }
  }
  const foods=readFoods(foodPath);
  const pantry=makePantry(foods);
  const {yMap,rMap,yDef,rDef}=readYieldRetention(retPath);
  const specs=makeSpecs(pantry);

  const ingredients=[]; const steps=[]; const master=[];
  let retryCount=0, mismatch=0;

  for(const spec of specs){
    if(!spec.name.includes('らーめん')) throw new Error('name rule fail '+spec.id);
    if(!spec.ingredients.some(x=>/らーめん/.test(x.name))) throw new Error('ramen ingredient missing '+spec.id);

    let rows=spec.ingredients.map(it=>rowOf(spec.id,it));
    let calc=calcRecipe(spec,rows,foods,yDef,rDef,yMap,rMap);
    let ok=spec.targetTags.every(t=>calc.tags.includes(t));
    if(!ok){
      for(let a=1;a<=MAX_RETRY;a++){
        rows=retryAdjust(rows,spec.targetTags,a).map(r=>({...r,Recipe_ID:spec.id}));
        calc=calcRecipe(spec,rows,foods,yDef,rDef,yMap,rMap);
        if(spec.targetTags.every(t=>calc.tags.includes(t))){ ok=true; retryCount++; break; }
      }
    }
    if(!ok) mismatch++;

    const pfcE=calc.total.protein*4+calc.total.fat*9+calc.total.carb*4;
    const diff=pfcE>0?Math.abs(calc.total.kcal-pfcE)/pfcE:0;
    if(diff>0.35) throw new Error(`energy mismatch ${spec.id} ${diff}`);
    if((spec.soupType==='豚骨'||spec.soupType.includes('担々'))&&calc.total.fat<10) throw new Error('fat too low for soup '+spec.id);
    if((spec.soupType==='豚骨'||spec.soupType.includes('担々'))&&calc.tags.includes('低脂質')) throw new Error('low-fat contradiction '+spec.id);
    if(calc.tags.includes('試合前')&&calc.hasIrr) throw new Error('pregame irritant contradiction '+spec.id);

    ingredients.push(...rows);
    steps.push(...mkSteps(spec));
    master.push({
      Recipe_ID:spec.id,
      Recipe_Name:spec.name,
      'Energy(kcal)':calc.total.kcal,
      'Protein(g)':calc.total.protein,
      'Fat(g)':calc.total.fat,
      'Carbohydrate(g)':calc.total.carb,
      P_ratio:calc.pRatio,F_ratio:calc.fRatio,C_ratio:calc.cRatio,
      Tag:calc.tags.join(', '),
      Cooking_Method:spec.method,
      Notes:`SoupType=${spec.soupType}; Food_Master=${path.basename(foodPath)}; Yield=Yield_Table; Retention=Retention_Table; ingredients=${rows.length}`,
    });
  }

  if(master.length!==TARGET) throw new Error('master size fail');
  for(let i=1;i<=TARGET;i++){ const ex=`RAMEN_${String(i).padStart(3,'0')}`; if(master[i-1].Recipe_ID!==ex) throw new Error('id mismatch '+ex); }

  for(const r of master){
    if(Object.values(r).some(hasNA)) throw new Error('NA in master '+r.Recipe_ID);
    const s=Number((r.P_ratio+r.F_ratio+r.C_ratio).toFixed(1)); if(Math.abs(s-100)>0.3) throw new Error('pfc ratio fail '+r.Recipe_ID);
    for(const k of ['Energy(kcal)','Protein(g)','Fat(g)','Carbohydrate(g)','P_ratio','F_ratio','C_ratio']) if(!Number.isFinite(r[k])) throw new Error('numeric fail '+r.Recipe_ID);
  }
  for(const r of ingredients) if(Object.values(r).some(hasNA)) throw new Error('NA in ingredients '+r.Recipe_ID);
  for(const r of steps) if(Object.values(r).some(hasNA)) throw new Error('NA in steps '+r.Recipe_ID);

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ingredients),'Ingredients');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(steps),'Steps');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(master),'Recipe_Master');
  XLSX.writeFile(wb,OUT_XLSX);

  const v=XLSX.readFile(OUT_XLSX,{cellText:true,cellDates:false});
  const excelValid=v.SheetNames.length===3&&['Ingredients','Steps','Recipe_Master'].every(s=>v.SheetNames.includes(s));
  if(!excelValid) throw new Error('xlsx structure invalid');

  const required=['醤油','味噌','塩','豚骨','担々風','野菜たっぷり','鶏白湯風'];
  const categoryValidity=required.every(k=>master.some(r=>r.Notes.includes(`SoupType=${k}`)));
  const nutritionMissingZero=master.every(r=>['Energy(kcal)','Protein(g)','Fat(g)','Carbohydrate(g)'].every(k=>Number.isFinite(r[k])));

  const report={
    recipe_count:master.length,
    ingredient_rows:ingredients.length,
    step_rows:steps.length,
    tag_mismatch_count:mismatch,
    category_validity:categoryValidity,
    retry_adjustment_count:retryCount,
    checks:{na_zero:true,nutrition_missing_zero:nutritionMissingZero,tag_consistency:mismatch===0,excel_valid:excelValid,pfc_consistency:true,energy_consistency:true,static_numeric_values:true}
  };
  fs.writeFileSync(OUT_REPORT,JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify(report,null,2));
}

try{ main(); }
catch(e){
  console.error(JSON.stringify({status:'failed',reason:e&&e.message?e.message:String(e),stopped_at:new Date().toISOString()},null,2));
  process.exit(1);
}
