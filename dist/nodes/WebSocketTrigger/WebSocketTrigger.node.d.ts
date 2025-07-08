import { INodeType, INodeTypeDescription, ITriggerFunctions, ITriggerResponse } from "n8n-workflow";
export declare class WebSocketTrigger implements INodeType {
    authPropertyName: string;
    description: INodeTypeDescription;
    trigger(this: ITriggerFunctions): Promise<ITriggerResponse>;
}
