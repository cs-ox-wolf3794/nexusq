import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the production clock in explicit five-minute slots and routes them to quote-only refresh',()=>{
  const workflow=readFileSync(new URL('../../../.github/workflows/scheduled-refresh.yml',import.meta.url),'utf8');
  const schedules=[...workflow.matchAll(/cron:\s*"([^"]+)"/g)].map(match=>match[1]);
  const quotes=schedules.find(schedule=>schedule.split(' ')[0].split(',').length===12);
  expect(quotes,'Quote schedule must enumerate minutes; combined range/step syntax is not allowed').toBeDefined();
  const [minute,hours,day,month,weekday]=quotes!.split(' ');
  expect(minute).toMatch(/^\d+(,\d+){11}$/);
  const minutes=minute.split(',').map(Number);
  expect(minutes.every(value=>value>=0&&value<60)).toBe(true);
  expect(minutes.every((value,index)=>((minutes[(index+1)%12]-value+60)%60)===5)).toBe(true);
  expect([hours,day,month,weekday]).toEqual(['12-23','*','*','1-5']);
  expect(workflow).toContain(`github.event.schedule == '${quotes}' && 'quotes' || 'full'`);
  expect(workflow).toContain('uses: ./.github/workflows/refresh-data.yml');
  expect(workflow).toContain('secrets: inherit');
  expect(schedules).toContain('19 6,16,18,22 * * 1-5');
  expect(schedules).toContain('19 6 * * 6');
});
