"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import s from "./overview.module.css";

type EventInfo = { title: string; day: number; time: string; place: string; shifts: string[] };
type RequestInfo = { name: string; group: number; event: number; flow: "activity" | "department" };
type Period = { events: EventInfo[]; requests: RequestInfo[]; activity: number[]; department: number[] };
const members = ["Nguyễn Minh Anh", "Lê Hải Yến", "Trần Hoàng Nam", "Võ Gia Hân", "Phạm Khánh An"];
const groups = [2, 3, 1, 4, 5];
const periods: Record<string, Period> = {
  "11": {
    events: [
      { title: "Gặp mặt tình nguyện viên", day: 22, time: "07:30", place: "Hội trường A · Đại học Quy Nhơn", shifts: ["07:30 – 09:00", "09:00 – 10:30"] },
      { title: "Ngày Chủ nhật xanh", day: 29, time: "07:00", place: "Cổng chính · Đại học Quy Nhơn", shifts: ["07:00 – 09:00", "14:00 – 16:00"] },
      { title: "Tiếp sức tân sinh viên", day: 8, time: "06:30", place: "Nhà A2 · Đại học Quy Nhơn", shifts: ["06:30 – 08:30", "08:30 – 10:30", "13:00 – 15:00"] },
    ],
    requests: [{ name: members[2], group: 1, event: 2, flow: "activity" }, { name: members[1], group: 3, event: 2, flow: "department" }],
    activity: [3, 2, 2, 1, 1], department: [1, 2, 0, 2, 1],
  },
  "10": {
    events: [
      { title: "Tổng kết tháng tình nguyện", day: 31, time: "15:00", place: "Hội trường B · Đại học Quy Nhơn", shifts: ["15:00 – 17:00"] },
      { title: "Đổi giấy lấy cây", day: 18, time: "08:00", place: "Sân thư viện · Đại học Quy Nhơn", shifts: ["08:00 – 10:00", "14:00 – 16:00"] },
    ],
    requests: [{ name: members[0], group: 2, event: 1, flow: "activity" }],
    activity: [1, 2, 2, 3, 1], department: [2, 0, 1, 1, 2],
  },
};

const symbols = {
  calendar: "M4 6h16v14H4z M8 3v6 M16 3v6 M4 11h16",
  pin: "M19 10c0 5-7 11-7 11s-7-6-7-11a7 7 0 1 1 14 0z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  arrow: "M5 12h14 m-6-6 6 6-6 6",
  people: "M14 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M3 20v-2a6 6 0 0 1 12 0v2 M16 5a4 4 0 0 1 0 7 M17 15c3 0 4 2 4 5",
  check: "M4 12l5 5L20 6",
  layers: "m12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  inbox: "M3 14 6 5h12l3 9v5H3z M3 14h5l1 2h6l1-2h5",
  close: "m6 6 12 12 M18 6 6 18",
};
function Icon({ name }: { name: keyof typeof symbols }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={symbols[name]} /></svg>;
}

type Detail = { type: "event" | "request"; index: number };
const flowName = { activity: "Hoạt động", department: "Mảng" };

export default function Overview() {
  const [month, setMonth] = useState("11");
  const [flow, setFlow] = useState<RequestInfo["flow"]>("activity");
  const [approved, setApproved] = useState<string[]>([]);
  const [detail, setDetail] = useState<Detail>({ type: "event", index: 0 });
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const period = periods[month];
  const feature = period.events[0];
  const isApproved = (index: number) => approved.includes(month + "-" + index);
  const pending = period.requests.map((request, index) => ({ ...request, index })).filter(request => !isApproved(request.index));
  const ranking = members.map((name, index) => ({
    name, group: groups[index],
    value: period[flow][index] + period.requests.filter((request, i) => isApproved(i) && request.name === name && request.flow === flow).length,
  })).sort((a, b) => b.value - a.value);
  const totalFor = (kind: RequestInfo["flow"]) => period[kind].reduce((a, b) => a + b, 0) + period.requests.filter((r,i) => r.flow === kind && isApproved(i)).length;
  const request = period.requests[detail.index];
  const event = period.events[detail.type === "request" && request ? request.event : detail.index] ?? feature;

  function open(next: Detail) {
    setDetail(next);
    dialog.current?.showModal();
  }

  return <div className={s.page} id="dau-trang">
    <header className={s.header}><div className={s.bar}>
      <a className={s.brand} href="#dau-trang"><Image src="/icon.png" width={44} height={44} alt="" /><span>TNTN QNU<small>Đội Thanh niên tình nguyện</small></span></a>
      <nav className={s.nav} aria-label="Đi đến nội dung"><a href="#dau-trang">Tổng quan</a><a href="#lich-doi">Lịch đội</a><a href="#xep-hang">Xếp hạng</a></nav>
      <span className={s.demo}>Dữ liệu mẫu</span>
    </div></header>
    <main className={s.main}>
      <div className={s.title}><div><h1>Tổng quan đội</h1><p>Đại học Quy Nhơn · Năm học 2026–2027</p></div>
        <label className={s.period}><Icon name="calendar"/><select aria-label="Tháng thống kê" value={month} onChange={e => {setMonth(e.target.value); setNotice("");}}><option value="11">Tháng 11, 2026</option><option value="10">Tháng 10, 2026</option></select></label>
      </div>
      <div className={s.featureGrid}>
        <article className={s.feature}>
          <div className={s.photo}><Image src="/anh2.jpg" alt="Tình nguyện viên QNU trong buổi gặp mặt của đội" fill priority sizes="(max-width: 700px) 37vw, 320px" /></div>
          <div className={s.featureContent}><span className={s.kicker}><span/>Hoạt động nổi bật</span><h2>{feature.title}</h2>
            <p><Icon name="calendar"/>{feature.day}/{month} · {feature.time}</p><p><Icon name="pin"/>{feature.place}</p>
            <button onClick={() => open({type:"event",index:0})}>Xem các ca <Icon name="arrow"/></button>
          </div>
        </article>
        <section className={s.panel}><div className={s.panelTitle}><h2>Cần xử lý</h2><span className={s.count}>{pending.length}</span></div>
          <p className={s.caption}>Đề nghị bổ sung điểm danh</p>
          {pending.map(r => <button className={s.task} key={r.index} onClick={() => open({type:"request",index:r.index})}><span className={s.taskIcon}><Icon name={r.flow === "activity" ? "inbox" : "layers"}/></span><span><b>{r.name}</b><small>{flowName[r.flow]} · Tổ {r.group}</small></span><Icon name="arrow"/></button>)}
          {!pending.length && <p className={s.done}><Icon name="check"/> Đã xử lý hết đề nghị tháng này.</p>}
          <span className={s.srOnly} role="status">{notice}</span>
        </section>
      </div>
      <div className={s.stats}>
        {([{icon:"calendar",value:period.events.length,label:"Hoạt động trong tháng"}, {icon:"people",value:totalFor("activity"),label:"Lượt điểm danh hoạt động"}, {icon:"layers",value:totalFor("department"),label:"Lượt điểm danh mảng"}] as const).map(stat => <div key={stat.icon}><span className={s.statIcon}><Icon name={stat.icon}/></span><span><b>{stat.value}</b><small>{stat.label}</small></span></div>)}
      </div>
      <div className={s.bottomGrid}>
        <section className={s.panel} id="lich-doi"><div className={s.panelTitle}><h2>Lịch hoạt động</h2><small>Tháng {month}</small></div>
          {period.events.map((item,index) => ({item,index})).sort((a,b)=>a.item.day-b.item.day).map(({item,index}) => <button className={s.eventRow} key={item.title} onClick={() => open({type:"event",index})}><span className={s.date}><b>{item.day}</b><small>TH {month}</small></span><span><b>{item.title}</b><small>{item.time} · {item.place.split(" · ")[0]}</small></span><Icon name="arrow"/></button>)}
        </section>
        <section className={s.panel} id="xep-hang"><div className={s.panelTitle}><h2>Bảng xếp hạng</h2><small>Theo lượt</small></div>
          <div className={s.tabs} role="group" aria-label="Loại điểm danh">{(["activity","department"] as const).map(key => <button key={key} onClick={() => setFlow(key)} aria-pressed={flow===key}>{flowName[key]}</button>)}</div>
          <ol className={s.ranks}>{ranking.slice(0,3).map((member,index) => <li key={member.name}><span>{ranking.findIndex(other=>other.value===member.value)+1}</span><b>{member.name}</b><small>Tổ {member.group}</small><strong>{ranking[index].value} lượt</strong></li>)}</ol>
        </section>
      </div>
    </main>
    <dialog className={s.dialog} aria-labelledby="preview-detail-title" ref={dialog}>
      <div className={s.dialogTop}><span>{detail.type==="request"?"Đề nghị bổ sung điểm danh":"Lịch hoạt động"}</span><button aria-label="Đóng" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
      <h2 id="preview-detail-title">{detail.type==="request"?request?.name:event.title}</h2>
      {detail.type==="request" && request && <p>{flowName[request.flow]} · Tổ {request.group} · {event.title}</p>}
      <p><Icon name="calendar"/>{event.day}/{month}/2026</p><p><Icon name="pin"/>{event.place}</p>
      {detail.type==="event" ? <ul>{event.shifts.map((shift,i)=><li key={shift}><b>Ca {i+1}</b><span>{shift}</span></li>)}</ul> :
        <button className={s.approve} onClick={()=>{setApproved(previous=>[...new Set([...previous,month+"-"+detail.index])]); setNotice("Đã duyệt đề nghị của "+request.name); dialog.current?.close();}}>Duyệt đề nghị mẫu <Icon name="check"/></button>}
    </dialog>
  </div>;
}
