import * as cdk from '@aws-cdk/core';
import codecommit = require('@aws-cdk/aws-codecommit');
import ecr = require('@aws-cdk/aws-ecr');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import pipelineAction = require('@aws-cdk/aws-codepipeline-actions');
import { codeToECRspec, deployToEKSspec, deployToEksStage } from '../utils/buildspecs.1';
import { CicdProps } from './cluster-stack';

export class CicdStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props: CicdProps) {
        super(scope, id, props);

        const primaryRegion = 'us-west-2';
        //const secondaryRegion = 'us-west-2';
        
        const petClinicRepo = new codecommit.Repository(this, 'pet-clinic-for-demoeks', {
            repositoryName: `pet-clinic-${cdk.Stack.of(this).region}`
        });
        
        new cdk.CfnOutput(this, `codecommit-uri`, {
            exportName: 'CodeCommitURL',
            value: petClinicRepo.repositoryCloneUrlHttp
        });
        
        const ecrForMainRegion = new ecr.Repository(this, `ecr-for-pet-clinic`);
        
        const buildForECR = codeToECRspec(this, ecrForMainRegion.repositoryUri, props.firstRegionRole);
        ecrForMainRegion.grantPullPush(buildForECR.role!);
        
        const deployToMainCluster = deployToEKSspec(this, primaryRegion, props.firstRegionCluster, ecrForMainRegion, props.firstRegionRole);
        
        const deployToStaging = deployToEksStage(this, primaryRegion, props.firstRegionCluster, ecrForMainRegion, props.firstRegionRole);
        
        const sourceOutput = new codepipeline.Artifact();

        new codepipeline.Pipeline(this, 'multi-region-eks-dep', {
            stages: [ {
                    stageName: 'Source',
                    actions: [ new pipelineAction.CodeCommitSourceAction({
                            actionName: 'CatchSourcefromCode',
                            repository: petClinicRepo,
                            output: sourceOutput,
                        })]
                },{
                    stageName: 'Build',
                    actions: [ new pipelineAction.CodeBuildAction({
                        actionName: 'BuildAndPushtoECR',
                        input: sourceOutput,
                        project: buildForECR
                    })]
                },
                {
                    stageName: 'DeployToMainEKScluster',
                    actions: [ new pipelineAction.CodeBuildAction({
                        actionName: 'DeployToMainEKScluster',
                        input: sourceOutput,
                        project: deployToMainCluster
                    })]
                },
                {
                    stageName: 'ApproveToDeployToStage',
                    actions: [ new pipelineAction.ManualApprovalAction({
                            actionName: 'ApproveToDeployToStage'
                    })]
                },
                {
                    stageName: 'DeployToStaging',
                    actions: [ new pipelineAction.CodeBuildAction({
                        actionName: 'DeployToStaging',
                        input: sourceOutput,
                        project: deployToStaging
                    })]
                }
                
            ]
        });
    }
}


