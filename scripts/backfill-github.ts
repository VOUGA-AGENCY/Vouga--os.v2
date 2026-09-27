import {runtime} from '../src/services/runtime';
import {syncProjectGithub} from '../src/services/github-service';
const ctx=runtime(), data=await ctx.repo.read();
const me=data.members.find(m=>m.id==='miguel'&&m.role==='admin')!;
for(const project of data.projects.filter(p=>p.repositories?.length)){
 await syncProjectGithub(ctx,me,project.id);
 const updated=await ctx.repo.read();
 console.log(JSON.stringify({project:project.name,githubActivity:updated.activity.filter(a=>a.projectId===project.id&&a.source==='github').length}));
}
