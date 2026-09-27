import {describe,it,expect,vi} from 'vitest';
import {api,ProviderError,type ServiceContext} from '../src/services/runtime';
import {errorResponse} from '../src/foundation/http';
describe('provider failures',()=>{
 it('preserves rate limits and retry timing without exposing provider payloads',async()=>{const ctx={fetch:vi.fn().mockResolvedValue(new Response('private upstream payload',{status:429,headers:{'Retry-After':'12'}})),now:()=>new Date().toISOString()} as unknown as ServiceContext;let failure:unknown;try{await api(ctx,'groq','https://example.test');}catch(error){failure=error;}const response=errorResponse(failure);expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('12');expect(await response.text()).toContain('12 segundos');expect(ctx.fetch).toHaveBeenCalledTimes(1);});
 it('maps timeouts and authentication failures to actionable messages',async()=>{const ctx={fetch:vi.fn().mockRejectedValue(new DOMException('secret endpoint','TimeoutError'))} as unknown as ServiceContext;await expect(api(ctx,'groq','https://example.test')).rejects.toMatchObject({status:504});const response=errorResponse(new ProviderError('groq',401));expect(response.status).toBe(502);expect(await response.text()).toContain('credenciais');});
});
