export type BatchRow = { id:string; batchId?:string; createdBy?:string; activityId?:string; kind?:string; sessionId?:string; flow?:string };
export function approvalBatches<T extends BatchRow>(rows:T[]): {key:string;rows:T[]}[] {
  const groups=new Map<string,T[]>();
  for(const row of rows){
    // A batch is never combined across senders or activities, including legacy rows.
    const key=JSON.stringify([row.createdBy||"",row.activityId||"",row.kind||"",row.flow||"",row.sessionId||"legacy",row.batchId||row.id]);
    const list=groups.get(key)||[];list.push(row);groups.set(key,list);
  }
  return [...groups].map(([key,rows])=>({key,rows}));
}
