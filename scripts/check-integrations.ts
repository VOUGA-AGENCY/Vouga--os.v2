import { runtime, api, seal } from "../src/services/runtime";
import { listRepositories } from "../src/services/github-service";
const ctx=runtime();
const results: Record<string,unknown>={};
try {
 seal({test:true},ctx.env);
 const redirect=new URL(ctx.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3100/api/integrations/google/callback");
 results.google={configuration:!!(ctx.env.GOOGLE_CLIENT_ID&&ctx.env.GOOGLE_CLIENT_SECRET),redirectPathValid:redirect.pathname==="/api/integrations/google/callback",authorization:"Ainda requer login de Office e Contacto."};
} catch {results.google={error:"Verificar chave de encriptação/configuração."};}
for (const provider of ["github","groq","telegram"] as const) {
 try {
  if (provider==="github") {const repos=await listRepositories(ctx);results.github={verified:true,repositoryCount:repos.length};}
  if (provider==="groq") {
   const models=await api<{data:{id:string}[]}>(ctx,"groq","https://api.groq.com/openai/v1/models",{headers:{Authorization:`Bearer ${ctx.env.GROQ_API_KEY}`}});
   results.groq={verified:true,agentModelAvailable:models.data.some(m=>m.id===(ctx.env.GROQ_AGENT_MODEL||"openai/gpt-oss-120b")),voiceModelAvailable:models.data.some(m=>m.id===(ctx.env.GROQ_TRANSCRIPTION_MODEL||"whisper-large-v3-turbo"))};
  }
  if (provider==="telegram") {
   const bot=await api<{ok:boolean;result:{username:string}}>(ctx,"telegram",`https://api.telegram.org/bot${ctx.env.TELEGRAM_BOT_TOKEN}/getMe`);
   if(!bot.ok) throw new Error("Bot não confirmado");
   results.telegram={verified:true,username:bot.result.username,webhook:"Não alterado; aguarda backend público."};
  }
  if(provider!=="telegram") await ctx.repo.transact(store=>{
   const connection=store.externalConnections.find(c=>c.id===provider);
   if(connection){connection.status="connected";delete connection.lastError;}
   else store.externalConnections.push({id:provider,provider,label:provider==="github"?"Vouga":"Groq",status:"connected"});
  });
 }catch(error){results[provider]={verified:false,error:error instanceof Error && /^\w+: HTTP \d+$/.test(error.message)?error.message:"Falha de configuração ou de ligação; sem credenciais nos logs."};}
}
console.log(JSON.stringify(results,null,2));
