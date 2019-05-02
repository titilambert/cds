import {Component, Input, NgZone, OnInit, ViewChild} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {TranslateService} from '@ngx-translate/core';
import {Store} from '@ngxs/store';
import {PermissionValue} from 'app/model/permission.model';
import {WorkflowCoreService} from 'app/service/workflow/workflow.core.service';
import {ToastService} from 'app/shared/toast/ToastService';
import {WorkflowWNodeMenuEditComponent} from 'app/shared/workflow/menu/edit-node/menu.edit.node.component';
import {WorkflowDeleteNodeComponent} from 'app/shared/workflow/modal/delete/workflow.node.delete.component';
import {WorkflowHookModalComponent} from 'app/shared/workflow/modal/hook-add/hook.modal.component';
import {WorkflowTriggerComponent} from 'app/shared/workflow/modal/node-add/workflow.trigger.component';
import {WorkflowNodeEditModalComponent} from 'app/shared/workflow/modal/node-edit/node.edit.modal.component';
import {OpenWorkflowNodeModal} from 'app/store/node.modal.action';
import {
    AddHookWorkflow,
    AddJoinWorkflow,
    AddNodeTriggerWorkflow,
    UpdateHookWorkflow,
    UpdateWorkflow
} from 'app/store/workflows.action';
import {IPopup} from 'ng2-semantic-ui';
import {ActiveModal} from 'ng2-semantic-ui/dist';
import { Subscription } from 'rxjs';
import {finalize} from 'rxjs/operators';
import { PipelineStatus } from '../../../model/pipeline.model';
import { Project } from '../../../model/project.model';
import {WNode, WNodeHook, WNodeJoin, WNodeTrigger, WNodeType, Workflow} from '../../../model/workflow.model';
import { WorkflowNodeRun, WorkflowRun } from '../../../model/workflow.run.model';
import { WorkflowEventStore } from '../../../service/workflow/workflow.event.store';
import { AutoUnsubscribe } from '../../decorator/autoUnsubscribe';

@Component({
    selector: 'app-workflow-wnode',
    templateUrl: './workflow.node.html',
    styleUrls: ['./workflow.node.scss']
})
@AutoUnsubscribe()
export class WorkflowWNodeComponent implements OnInit {

    @Input() node: WNode;
    @Input() workflow: Workflow;
    @Input() project: Project;

    @ViewChild('menu')
    menu: WorkflowWNodeMenuEditComponent;

    // Selected node
    isSelected = false;

    // Selected workflow run
    workflowRun: WorkflowRun;
    currentNodeRun: WorkflowNodeRun;
    warnings = 0;
    loading: boolean;

    // Subscription
    subSelectedNode: Subscription;
    subNodeRun: Subscription;
    subWorkflowRun: Subscription;

    zone = new NgZone({});

    // Modal
    @ViewChild('workflowDeleteNode')
    workflowDeleteNode: WorkflowDeleteNodeComponent;
    @ViewChild('workflowTrigger')
    workflowTrigger: WorkflowTriggerComponent;
    @ViewChild('workflowAddHook')
    workflowAddHook: WorkflowHookModalComponent;
    @ViewChild('nodeEditModal')
    nodeEditModal: WorkflowNodeEditModalComponent;

    constructor(
        private _activatedRoute: ActivatedRoute,
        private _router: Router,
        private _workflowEventStore: WorkflowEventStore,
        private _store: Store,
        private _workflowCoreService: WorkflowCoreService,
        private _toast: ToastService,
        private _translate: TranslateService,
    ) { }

    ngOnInit(): void {
        // Subscribe to node run events
        this.subNodeRun = this._workflowEventStore.nodeRunEvents().subscribe(wnr => {
            if (wnr) {
                if (!this.workflowRun || this.workflowRun.id !== wnr.workflow_run_id) {
                    return;
                }
                if (wnr.workflow_node_id !== this.node.id) {
                    return;
                }
                this.currentNodeRun = wnr;
            }
        });

        this.subSelectedNode = this._workflowEventStore.selectedNode()
            .subscribe(n => {
                if (n) {
                    this.isSelected = (n.id === this.node.id);
                } else {
                    this.isSelected = false;
                }
            });

        // Subscribe to workflow run events
        this.subWorkflowRun = this._workflowEventStore.selectedRun().subscribe(wr => {
            this.warnings = 0;
            if (!wr && !this.workflowRun) {
                return;
            }
            if (wr) {
                if (this.workflowRun && this.workflowRun.id !== wr.id) {
                    this.currentNodeRun = null;
                }
                this.workflowRun = wr;
                if (wr.nodes && wr.nodes[this.node.id] && wr.nodes[this.node.id].length > 0) {
                    if (!this.currentNodeRun ||
                        ((new Date(wr.nodes[this.node.id][0].last_modified)) > (new Date(this.currentNodeRun.last_modified)))) {
                        this.currentNodeRun = wr.nodes[this.node.id][0];
                    }
                }
            } else {
                this.workflowRun = null;
            }

            if (this.currentNodeRun && this.currentNodeRun.status === PipelineStatus.SUCCESS) {
                this.computeWarnings();
            }
        });
    }

    clickOnNode(popup: IPopup): void {

        if (this.workflow.previewMode || !popup) {
            return;
        }
        popup.open();

    }

    dblClickOnNode() {
        switch (this.node.type) {
            case WNodeType.PIPELINE:
                if (this._workflowEventStore.isRunSelected() && this.currentNodeRun) {
                    this._router.navigate([
                        'node', this.currentNodeRun.id
                    ], {
                        relativeTo: this._activatedRoute, queryParams: {
                            name: this.node.name,
                            node_id: this.node.id, node_ref: this.node.ref
                        }
                        });
                } else {
                    this._router.navigate([
                        '/project', this.project.key,
                        'pipeline', Workflow.getPipeline(this.workflow, this.node).name
                    ], { queryParams: { workflow: this.workflow.name, node_id: this.node.id, node_ref: this.node.ref } });
                }
                break;
            case WNodeType.OUTGOINGHOOK:
                if (this._workflowEventStore.isRunSelected()
                    && this.currentNodeRun
                    && this.node.outgoing_hook.config['target_workflow']
                    && this.currentNodeRun.callback) {
                    this._router.navigate([
                        '/project', this.project.key,
                        'workflow', this.node.outgoing_hook.config['target_workflow'].value,
                        'run', this.currentNodeRun.callback.workflow_run_number
                    ], { queryParams: {} });
                }
                break;
        }
    }

    receivedEvent(e: string): void {
        switch (e) {
            case 'pipeline':
                this.openTriggerModal('pipeline', false);
                break;
            case 'parent':
                this.openTriggerModal('pipeline', false);
                break;
            case 'edit':
                this._store.dispatch(new OpenWorkflowNodeModal({
                    project: this.project,
                    workflow: this.workflow,
                    node: this.node,
                    hook: null
                })).subscribe(() => {});
                break;
            case 'hook':
                this.openAddHookModal();
                break;
            case 'outgoinghook':
                this.openTriggerModal('outgoinghook', false);
                break;
            case 'fork':
                this.createFork();
                break;
            case 'join':
                this.createJoin();
                break;
            case 'join_link':
                this.linkJoin();
                break;
            case 'delete':
                this.openDeleteNodeModal();
                break
        }
    }


    computeWarnings() {
        this.warnings = 0;
        if (!this.currentNodeRun || !this.currentNodeRun.stages) {
            return;
        }
        this.currentNodeRun.stages.forEach((stage) => {
            if (Array.isArray(stage.run_jobs)) {
                this.warnings += stage.run_jobs.reduce((fail, job) => {
                    if (!job.job || !Array.isArray(job.job.step_status)) {
                        return fail;
                    }
                    return fail + job.job.step_status.reduce((failStep, step) => {
                        if (step.status === PipelineStatus.FAIL) {
                            return failStep + 1;
                        }
                        return failStep;
                    }, 0);
                }, 0);
            }
        })
    }

    canEdit(): boolean {
        return this.workflow.permission === PermissionValue.READ_WRITE_EXECUTE;
    }

    openDeleteNodeModal(): void {
        if (!this.canEdit()) {
            return;
        }
        if (this.workflowDeleteNode) {
            this.workflowDeleteNode.show();
        }
    }

    openTriggerModal(t: string, parent: boolean): void {
        if (!this.canEdit()) {
            return;
        }
        if (this.workflowTrigger) {
            this.workflowTrigger.show(t, parent);
        }
    }

    openAddHookModal(): void {
        if (this.canEdit() && this.workflowAddHook) {
            this.workflowAddHook.show();
        }
    }

    updateHook(hook: WNodeHook, modal: ActiveModal<boolean, boolean, void>): void {
        this.loading = true;

        let action = new UpdateHookWorkflow({
            projectKey: this.project.key,
            workflowName: this.workflow.name,
            hook
        });

        if (!hook.uuid) {
            action = new AddHookWorkflow({
                projectKey: this.project.key,
                workflowName: this.workflow.name,
                hook
            });
        }

        this._store.dispatch(action).pipe(finalize(() => this.loading = false))
            .subscribe(() => {
                this._toast.success('', this._translate.instant('workflow_updated'));
                if (modal) {
                    modal.approve(null);
                }
            });
    }

    createFork(): void {
        let n = Workflow.getNodeByID(this.node.id, this.workflow);
        let fork = new WNode();
        fork.type = WNodeType.FORK;
        let t = new WNodeTrigger();
        t.child_node = fork;
        t.parent_node_id = n.id;
        t.parent_node_name = n.ref;

        this.loading = true;
        this._store.dispatch(new AddNodeTriggerWorkflow({
            projectKey: this.project.key,
            workflowName: this.workflow.name,
            parentId: this.node.id,
            trigger: t
        })).pipe(finalize(() => this.loading = false));
    }

    createJoin(): void {
        let join = new WNode();
        join.type = WNodeType.JOIN;
        join.parents = new Array<WNodeJoin>();
        let p = new WNodeJoin();
        p.parent_id = this.node.id;
        p.parent_name = this.node.ref;
        join.parents.push(p);

        this.loading = true;
        this._store.dispatch(new AddJoinWorkflow({
            projectKey: this.project.key,
            workflowName: this.workflow.name,
            join
        })).pipe(finalize(() => this.loading = false));
    }

    updateWorkflow(w: Workflow, modal: ActiveModal<boolean, boolean, void>): void {
        this.loading = true;
        this._store.dispatch(new UpdateWorkflow({
            projectKey: this.project.key,
            workflowName: this.workflow.name,
            changes: w
        })).pipe(finalize(() => this.loading = false))
            .subscribe(() => {
                this._toast.success('', this._translate.instant('workflow_updated'));
                if (modal) {
                    modal.approve(null);
                }
            }, () => {
                if (Array.isArray(this.node.hooks) && this.node.hooks.length) {
                    this.node.hooks.pop();
                }
            });
    }

    linkJoin(): void {
        if (!this.canEdit()) {
            return;
        }
        this._workflowCoreService.linkJoinEvent(this.node);
    }
}
