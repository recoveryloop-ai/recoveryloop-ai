"use client";
import { useEffect, useState } from "react";

type Task={id:string;state:string;outcome:string;revision:number};
export function OperatorCasework({caseRef}:{caseRef:string}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [task,setTask]=useState<Task|null>(null),[message,setMessage]=useState("");
 const [tasks,setTasks]=useState<Task[]>([]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/cases/${encodeURIComponent(caseRef)}/casework`,{cache:"no-store",signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error("Unable to load internal tasks.");
   const data=await response.json() as {tasks:Task[]};setTasks(data.tasks);setTask(data.tasks.find(task=>task.state==="OPEN")??data.tasks[0]??null);
  }).catch((reason:unknown)=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Task load failed.");});
  return ()=>controller.abort();
 },[caseRef]);
 async function act(action:"investigate"|"override") {
  setBusy(true);setError("");
  try {
   const body=action==="investigate"?{action}:{action,taskId:task?.id,revision:task?.revision,reason:"OPERATOR_REVIEW_REQUIRED"};
   const response=await fetch(`/api/cases/${encodeURIComponent(caseRef)}/casework`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const result=await response.json() as {code?:string;task?:Task|null;run?:{mode:string;validationCode:string}};
   if(!response.ok) throw Error(result.code??"Case work unavailable.");
   setTask(result.task??null);
   if(result.task)setTasks(current=>[result.task!,...current.filter(task=>task.id!==result.task!.id)]);
   setMessage(action==="override"?"Internal task overridden. Audit recorded; no financial state changed.":result.run?.mode==="RULES_ONLY"?`Rules-only result: ${result.run.validationCode}. No task created.`:"Validated investigation completed. Internal routing task recorded automatically. Refresh to inspect the stored run.");
  }catch(reason){setError(reason instanceof Error?reason.message:"Case work failed.");}finally{setBusy(false);}
 }
 return <section className="panel s7-panel" aria-label="Protected operator case work"><p className="eyebrow">Authenticated operator</p><h2>Complete internal case work</h2><p>Run a bounded read-only investigation. A validated result records an internal follow-up task automatically. No messages or provider writes.</p><div className="header-actions"><button className="button primary compact" type="button" disabled={busy} onClick={()=>act("investigate")}>{busy?"Working…":"Investigate and record task"}</button>{task?.state==="OPEN"?<button className="button secondary compact" type="button" disabled={busy} onClick={()=>act("override")}>Override: operator review required</button>:null}</div>{tasks.length>1?<label>Stored internal task <select value={task?.id??""} onChange={event=>setTask(tasks.find(task=>task.id===event.target.value)??null)}>{tasks.map(task=><option key={task.id} value={task.id}>{task.outcome} · {task.state}</option>)}</select></label>:null}{task?<p>Internal task: {task.outcome} · {task.state} · revision {task.revision}</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}</section>;
}
