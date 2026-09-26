import { useSearchParams } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { ActivityTab } from '@/components/project/ActivityTab';
import { AttachmentsTab } from '@/components/project/AttachmentsTab';
import { LabelsTab } from '@/components/project/LabelsTab';
import { MembersTab } from '@/components/project/MembersTab';
import { TasksTab } from '@/components/project/TasksTab';
import { useProjectContext } from '@/layouts/ProjectLayout';

const TABS = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'labels', label: 'Labels' },
  { value: 'members', label: 'Members' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'activity', label: 'Activity' },
] as const;

/**
 * The project overview.
 *
 * These are tabs, not routes, and that is a deliberate call. A tab changes
 * *what* you are looking at within one context — the project — and each pane
 * needs the project record the layout already fetched. Making them routes would
 * mean either refetching that record per pane or threading it through more
 * outlet contexts, for no gain: nobody links to "the labels tab of a project" in
 * a way that has to survive a reload.
 *
 * The task detail *is* a route, because that one is genuinely addressable —
 * people paste links to individual tasks.
 *
 * The active tab lives in a query parameter rather than component state so that
 * coming back from a task with the browser's back button lands on the tab you
 * left, and so a reload does not silently reset to Tasks.
 */
export const ProjectOverview = () => {
  const { project } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('tab');
  const tab =
    requested !== null && TABS.some((entry) => entry.value === requested) ? requested : 'tasks';

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <TabsList className="px-4 lg:px-6">
        {TABS.map((entry) => (
          <TabsTrigger
            key={entry.value}
            value={entry.value}
            count={entry.value === 'members' ? project.members?.length : undefined}
          >
            {entry.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <PageContainer>
        <TabsContent value="tasks">
          <TasksTab project={project} />
        </TabsContent>

        <TabsContent value="labels">
          <LabelsTab project={project} />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab project={project} />
        </TabsContent>

        <TabsContent value="attachments">
          <AttachmentsTab project={project} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab project={project} />
        </TabsContent>
      </PageContainer>
    </Tabs>
  );
};
