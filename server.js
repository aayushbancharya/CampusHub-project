require('dotenv').config();
const express=require('express'),Db=require('better-sqlite3'),bc=require('bcryptjs'),jwt=require('jsonwebtoken');
const db=new Db(process.env.DB_PATH||'campus.db'),S=process.env.JWT_SECRET||'change-me';
const TYPES=['task','reg','exp','ach','notif','goal','post','history'];
db.exec(`create table if not exists users(id integer primary key,name,email unique,pass,role default 'student',profile default '{}');
create table if not exists items(id integer primary key,uid int,type,data,ts default current_timestamp);
create table if not exists events(id integer primary key,title,cat,hidden int,dept,date,etime default '10:00 AM',venue,lat real,lng real,fee real,descr,link,uid int);
create table if not exists schol(id integer primary key,name,elig,deadline,link);`);
const day=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
if(!db.prepare('select count(*) c from events').get().c){
 const e=db.prepare('insert into events(title,cat,hidden,dept,date,venue,lat,lng,fee,descr,link) values(?,?,?,?,?,?,?,?,?,?,?)');
 [['Smart India Hackathon Prelims','Hackathon',0,'All',4,'IIT Delhi, Hauz Khas',28.545,77.1926,0,'24-hour national hackathon on civic tech, AI and IoT.','https://sih.gov.in'],
  ['DTU Code Sprint','Hackathon',0,'CSE',9,'Delhi Technological University',28.7501,77.1177,200,'Competitive coding and web-dev sprint.','#'],
  ['AI & ML Workshop','Workshop',0,'IT',6,'JNU Convention Centre',28.5402,77.1662,100,'Hands-on machine learning with Python.','#'],
  ['Robotics Club Open Lab','Club',1,'ECE',3,'Jamia Millia Islamia, Engg Block',28.5617,77.2822,0,'Hidden club night: build and race line-follower bots.','#'],
  ['Literary Society Open Mic','Club',1,'English',5,'Delhi University North Campus',28.6889,77.21,0,'Poetry, stories and stand-up from several departments.','#'],
  ['Startup Pitch Fest','Competition',0,'MBA',12,'Pragati Maidan',28.618,77.243,500,'Pitch your startup to angel investors.','#'],
  ['Cybersecurity CTF','Competition',0,'CSE',15,'NSUT Dwarka',28.609,77.0378,150,'Capture-the-flag with web, crypto and forensics.','#'],
  ['Photography Walk','Club',1,'Arts',2,'India Gate Lawns',28.6129,77.2295,0,'Casual club walk, all skill levels welcome.','#']
 ].forEach(r=>{r[4]=day(r[4]);e.run(...r)});
 const s=db.prepare('insert into schol values(null,?,?,?,?)');
 [['National Scholarship Portal (Central Sector)','Class 12 above 80th percentile; family income < 4.5L',20,'https://scholarships.gov.in'],
  ['Reliance Foundation UG Scholarship','First-year UG, merit + need based',25,'https://www.reliancefoundation.org'],
  ['Google Generation Scholarship','CS students, underrepresented groups',40,'https://buildyourfuture.withgoogle.com/scholarships'],
  ['HDFC Badhte Kadam','Students facing financial crisis',14,'https://www.hdfcbank.com/personal/borrow/popular-loans/educational-loan'],
  ['Aditya Birla Scholarship','Top institutes, merit based',33,'https://www.adityabirlascholars.net']].forEach(r=>{r[2]=day(r[2]);s.run(...r)});
 const u=db.prepare('insert into users(name,email,pass,role,profile) values(?,?,?,?,?)'),h=bc.hashSync('demo123',10);
 u.run('Demo Student','student@demo.com',h,'student',JSON.stringify({course:'B.Tech CSE',year:'2',skills:'python, web, ai',interests:'hackathon, robotics, startup'}));
 u.run('Demo Organizer','organizer@demo.com',h,'organizer','{}');
 u.run('Riya Sharma','riya@demo.com',h,'student',JSON.stringify({course:'B.Tech IT',year:'3',skills:'python, ml, design',interests:'hackathon, ai, photography'}));
}
const sign=u=>jwt.sign({id:u.id},S,{expiresIn:'7d'});
const pub=u=>({id:u.id,name:u.name,email:u.email,role:u.role,profile:JSON.parse(u.profile)});
const log=(uid,a)=>db.prepare("insert into items(uid,type,data) values(?,'history',?)").run(uid,JSON.stringify({a}));
const auth=(q,s,n)=>{try{q.uid=jwt.verify((q.headers.authorization||'').slice(7),S).id;n()}catch{s.status(401).json({error:'Please log in'})}};
const app=express();app.use(express.json());app.use(express.static(__dirname+'/public'));
app.get('/api/config',(q,s)=>s.json({mapsKey:process.env.GOOGLE_MAPS_KEY||''}));
app.post('/api/register',(q,s)=>{const{name,email,password,role}=q.body;
 if(!name||!email||!password||password.length<6)return s.status(400).json({error:'Fill all fields (password min 6 chars)'});
 try{const r=db.prepare('insert into users(name,email,pass,role) values(?,?,?,?)').run(name,email.toLowerCase(),bc.hashSync(password,10),role=='organizer'?'organizer':'student');
  const u=db.prepare('select * from users where id=?').get(r.lastInsertRowid);log(u.id,'Signed up');s.json({token:sign(u),user:pub(u)})}
 catch{s.status(400).json({error:'Email already registered'})}});
app.post('/api/login',(q,s)=>{const u=db.prepare('select * from users where email=?').get((q.body.email||'').toLowerCase());
 if(!u||!bc.compareSync(q.body.password||'',u.pass))return s.status(400).json({error:'Wrong email or password'});
 log(u.id,'Logged in');s.json({token:sign(u),user:pub(u)})});
app.use('/api',auth);
app.get('/api/me',(q,s)=>s.json(pub(db.prepare('select * from users where id=?').get(q.uid))));
app.put('/api/me',(q,s)=>{const u=db.prepare('select * from users where id=?').get(q.uid);
 db.prepare('update users set name=?,profile=? where id=?').run(q.body.name||u.name,JSON.stringify(q.body.profile||JSON.parse(u.profile)),q.uid);
 s.json(pub(db.prepare('select * from users where id=?').get(q.uid)))});
app.get('/api/events',(q,s)=>s.json(db.prepare("select e.*,(select count(*) from items where type='reg' and json_extract(data,'$.eid')=e.id) regs from events e order by date").all()));
app.post('/api/events',(q,s)=>{const u=db.prepare('select role from users where id=?').get(q.uid);
 if(u.role!='organizer')return s.status(403).json({error:'Organizers only'});const b=q.body;
 db.prepare('insert into events(title,cat,hidden,dept,date,etime,venue,lat,lng,fee,descr,link,uid) values(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(b.title,b.cat,b.hidden?1:0,b.dept,b.date,b.etime||'10:00 AM',b.venue,+b.lat,+b.lng,+b.fee||0,b.descr,b.link||'#',q.uid);
 log(q.uid,'Published event: '+b.title);s.json({ok:1})});
app.delete('/api/events/:id',(q,s)=>{db.prepare('delete from events where id=? and uid=?').run(q.params.id,q.uid);log(q.uid,'Deleted an event');s.json({ok:1})});
app.get('/api/schol',(q,s)=>s.json(db.prepare('select * from schol order by deadline').all()));
app.get('/api/community',(q,s)=>s.json(db.prepare("select i.id,i.uid,i.data,i.ts,u.name from items i join users u on u.id=i.uid where type='post' order by i.id desc limit 100").all()));
app.get('/api/teammates',(q,s)=>s.json(db.prepare('select id,name,profile from users where id!=?').all(q.uid)));
app.delete('/api/history',(q,s)=>{db.prepare("delete from items where uid=? and type='history'").run(q.uid);s.json({ok:1})});
app.get('/api/items/:t',(q,s)=>s.json(db.prepare('select * from items where uid=? and type=? order by id desc limit 500').all(q.uid,q.params.t)));
app.post('/api/items/:t',(q,s)=>{const t=q.params.t;if(!TYPES.includes(t))return s.status(400).json({error:'bad type'});
 const r=db.prepare('insert into items(uid,type,data) values(?,?,?)').run(q.uid,t,JSON.stringify(q.body));
 if(!['history','notif'].includes(t))log(q.uid,'Added '+t+(q.body.title?': '+q.body.title:''));s.json({id:r.lastInsertRowid})});
app.put('/api/items/:id',(q,s)=>{db.prepare('update items set data=? where id=? and uid=?').run(JSON.stringify(q.body),q.params.id,q.uid);s.json({ok:1})});
app.delete('/api/items/:id',(q,s)=>{db.prepare('delete from items where id=? and uid=?').run(q.params.id,q.uid);log(q.uid,'Removed an item');s.json({ok:1})});
app.listen(process.env.PORT||3000,()=>console.log('CampusHub on http://localhost:'+(process.env.PORT||3000)));
