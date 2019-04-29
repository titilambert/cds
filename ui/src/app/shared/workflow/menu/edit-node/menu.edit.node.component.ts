import {
    Component,
    EventEmitter,
    Input,
    Output
} from '@angular/core';
import {PermissionValue} from 'app/model/permission.model';
import {
    WNode,
    Workflow,
} from 'app/model/workflow.model';
import {AutoUnsubscribe} from 'app/shared/decorator/autoUnsubscribe';
import {IPopup} from 'ng2-semantic-ui';

@Component({

    selector: 'app-workflow-menu-wnode-edit',
    templateUrl: './menu.edit.node.html',
    styleUrls: ['./menu.edit.node.scss'],
})
@AutoUnsubscribe()
export class WorkflowWNodeMenuEditComponent {

    // Project that contains the workflow
    @Input() workflow: Workflow;
    @Input() node: WNode;
    @Input() popup: IPopup;
    @Output() event = new EventEmitter<string>();
    permissionEnum = PermissionValue;

    constructor() {}

    sendEvent(e: string): void {
        this.popup.close();
        this.event.emit(e);
    }
}
