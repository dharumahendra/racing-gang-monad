import { ApiError } from './api';
export class RunLaunch<T extends {dispose():void}={dispose():void}> {
  private epoch=0;private request:AbortController|null=null;private client:T|null=null;busy=false;
  async begin(getToken:()=>Promise<string|null>,create:(token:string,signal:AbortSignal)=>Promise<T>):Promise<T|null>{
    if(this.busy||this.client)return null;
    const generation=this.epoch;const request=new AbortController();this.request=request;this.busy=true;
    try{
      const token=await getToken();if(generation!==this.epoch)return null;
      if(!token)throw new ApiError('Session expired. Sign in again.','UNAUTHORIZED');
      const next=await create(token,request.signal);if(generation!==this.epoch){next.dispose();return null;}
      this.client=next;return next;
    }catch(error){if(generation!==this.epoch)return null;throw error;}
    finally{if(generation===this.epoch){this.busy=false;this.request=null;}}
  }
  invalidate(){this.epoch++;this.request?.abort();this.request=null;this.client?.dispose();this.client=null;this.busy=false;}
}
