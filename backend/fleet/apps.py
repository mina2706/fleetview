from django.apps import AppConfig
from .data_loader import load_all_data
from pathlib import Path

class FleetConfig(AppConfig):
    name = 'fleet'

    def ready(self) : 
        BASE_DIR = Path(__file__).parent.parent.parent
        data_path=BASE_DIR/"data"
        self.data, self.common_metadata = load_all_data(data_path)
        return self.data , self.common_metadata
