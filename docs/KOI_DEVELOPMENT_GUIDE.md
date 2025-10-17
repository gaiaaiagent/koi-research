# KOI Development Guide

This document provides hands-on guidance for extending KOI. It was moved out of the Master Guide for concision.

## Adding a New Sensor

1) Create Sensor Directory
```bash
cd /opt/projects/koi-sensors/sensors
mkdir my_sensor
cd my_sensor
```

2) Implement Sensor Class
```python
# my_sensor.py
from shared.handlers.base_sensor import BaseSensor
from koi_protocol.core.rid_system import GenericRID
from shared.config.base import BaseSensorConfig

class MySensor(BaseSensor):
    async def collect_data(self) -> List[Dict]:
        response = await self.http_client.get("https://api.platform.com/data")
        return response.json()

    def create_rid(self, item: Dict) -> RID:
        return GenericRID("my.platform", item["id"])

    def extract_content(self, item: Dict) -> Dict:
        return {
            "text": item["body"],
            "title": item["title"],
            "author": item["author"],
            "created_at": item["timestamp"]
        }
```

3) Create Configuration
```yaml
# config.yaml
sensor:
  name: my_sensor
  platform: my_platform
  poll_interval: 1800

api:
  base_url: https://api.platform.com
  api_key_env: MY_PLATFORM_API_KEY

koi_net:
  coordinator_url: http://localhost:8005
  cache_directory: ./cache
```

4) Setup Script
```bash
# setup.sh
#!/bin/bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

5) Start Script
```bash
# start.sh
#!/bin/bash
source ../../.env
source venv/bin/activate
python my_sensor.py
```

6) Tests
```python
# tests/test_my_sensor.py
import pytest
from sensors.my_sensor.my_sensor import MySensor

@pytest.mark.asyncio
async def test_collect_data():
    config = load_test_config()
    sensor = MySensor(config)
    data = await sensor.collect_data()
    assert len(data) > 0
    assert "id" in data[0]

def test_create_rid():
    sensor = MySensor(load_test_config())
    item = {"id": "123", "user": "456"}
    rid = sensor.create_rid(item)
    assert rid.to_string() == "orn:my.platform:456/123"
```

## Custom RID Types

```python
# shared/rid_types/my_platform.py
from koi_protocol.core.rid_system import ORN

class MyPlatformRID(ORN):
    """My Platform RID: orn:my.platform:user_id/item_id"""
    namespace = "my.platform"

    def __init__(self, user_id: str, item_id: str):
        self.user_id = user_id
        self.item_id = item_id
        super().__init__()

    @property
    def reference(self) -> str:
        return f"{self.user_id}/{self.item_id}"

# Register
from koi_protocol.core.rid_system import rid_registry
rid_registry.register("my.platform", MyPlatformRID)
```

## Integration Tests

```bash
docker-compose -f docker-compose.test.yml up -d
pytest tests/integration/
```

