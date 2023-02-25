from opentelemetry import metrics
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import SERVICE_NAME, Resource

# Service name is required for most backends
resource = Resource(attributes={
    SERVICE_NAME: "reproduction-issue"
})

reader = PeriodicExportingMetricReader(
    OTLPMetricExporter()
)
provider = MeterProvider(resource=resource, metric_readers=[reader])
metrics.set_meter_provider(provider)
meter = metrics.get_meter(__name__)

cold_start_counter = meter.create_counter(
    "cold_start_counter",
    description="The number of cold_starts",
)
test_counter = meter.create_counter(
    "test_counter",
    description="The number of counts",
)

def handler(event, context):
    print(context)
    print('writing metric 1')
    test_counter.add(1, {'env': 'dev'})
    print('done')
    return
