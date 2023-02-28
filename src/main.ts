import * as path from 'path';
import * as lambdaPython from '@aws-cdk/aws-lambda-python-alpha';
import {
  App, Duration, Stack, StackProps, RemovalPolicy,
  aws_aps as aps,
  aws_grafana as grafana,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ReproObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const namingPrefix = 'prometheus-repro';

    const logGroup = new logs.LogGroup(this, 'ReproObservabilityLogGroup', {
      logGroupName: `/aws/prometheus/${namingPrefix}-dev`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new aps.CfnWorkspace(this, 'ReproductionPrometheusWorkspace', {
      alias: namingPrefix,
      loggingConfiguration: {
        logGroupArn: logGroup.logGroupArn,
      },
      tags: [{
        key: 'Name',
        value: namingPrefix,
      }],
    });
    const grafanaRole = new iam.Role(this, 'ReproGrafanaRole', {
      roleName: 'prom-repro-grafana-dev',
      assumedBy: new iam.ServicePrincipal('grafana.amazonaws.com'),
      managedPolicies: [{
        managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonPrometheusFullAccess',
      }],
    });
    new grafana.CfnWorkspace(this, 'ReproGrafanaWorkspace', {
      accountAccessType: 'CURRENT_ACCOUNT',
      authenticationProviders: ['AWS_SSO'],
      name: 'ReproGrafana',
      description: 'A simple observability example',
      permissionType: 'SERVICE_MANAGED',
      roleArn: grafanaRole.roleArn,
      dataSources: ['PROMETHEUS'],
    });

    const otelLayerArn = 'arn:aws:lambda:us-east-2:901920570463:layer:aws-otel-python-amd64-ver-1-16-0:1';
    const otelLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OtelLayer', otelLayerArn);

    const reproLambda = new lambdaPython.PythonFunction(this, 'ReproPrometheusLambda', {
      functionName: `${namingPrefix}-dev`,
      description: 'Validate lambda can write to APS',
      entry: path.join(__dirname, '..', 'lambda'),
      runtime: lambda.Runtime.PYTHON_3_9,
      index: 'handler.py',
      handler: 'handler',
      timeout: Duration.minutes(1),
      memorySize: 256,
      retryAttempts: 0,
      reservedConcurrentExecutions: 150,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ENVIRONMENT: 'dev',
        OPENTELEMETRY_COLLECTOR_CONFIG_FILE: '/var/task/collector.yaml',
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument',
        OTEL_METRICS_EXPORTER: 'otlp_proto_http',
        NAMING_PREFIX: namingPrefix,
      },
      layers: [otelLayer],
    });
    reproLambda.role?.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        'aps:RemoteWrite',
        'aps:GetSeries',
        'aps:GetLabels',
        'aps:GetMetricMetadata',
      ],
    }));

  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new ReproObservabilityStack(app, 'proserve-example-dev', { env: devEnv });
// new MyStack(app, 'proserve-example-prod', { env: prodEnv });

app.synth();
