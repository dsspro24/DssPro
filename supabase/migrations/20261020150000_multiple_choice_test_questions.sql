create or replace function public.get_employee_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  safe_resources jsonb := '[]'::jsonb;
  resource jsonb;
  safe_questions jsonb;
begin
  workspace := public.get_employee_workspace_internal();
  for resource in
    select item.value from jsonb_array_elements(coalesce(workspace #> '{data,resources}', '[]'::jsonb)) as item(value)
  loop
    select coalesce(jsonb_agg(
      (question.value - 'correctIndex' - 'correctIndices' - 'multipleAnswers')
      || jsonb_build_object('multipleAnswers', jsonb_typeof(question.value -> 'correctIndices') = 'array')
    ), '[]'::jsonb)
      into safe_questions
      from jsonb_array_elements(coalesce(resource -> 'questions', '[]'::jsonb)) as question(value);
    safe_resources := safe_resources || jsonb_build_array(jsonb_set(resource, '{questions}', safe_questions, true));
  end loop;
  workspace := jsonb_set(workspace, '{data,resources}', safe_resources, true);
  return workspace;
end;
$$;

revoke all on function public.get_employee_workspace() from public, anon;
grant execute on function public.get_employee_workspace() to authenticated;
