"""Safe YAML-first configuration loading; JSON remains a legacy input format."""
import json
from pathlib import Path


def parse_config(raw, suffix):
    text=raw.decode('utf-8-sig') if isinstance(raw,bytes) else raw
    if suffix.lower() in ('.yaml','.yml'):
        import yaml
        class UniqueLoader(yaml.SafeLoader):pass
        def mapping(loader,node):
            result={}
            for key_node,value_node in node.value:
                key=loader.construct_object(key_node)
                if not isinstance(key,str):raise ValueError('Configuration keys must be strings')
                if key in result:raise ValueError('Duplicate YAML key: '+key)
                result[key]=loader.construct_object(value_node)
            return result
        UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,mapping)
        data=yaml.load(text,Loader=UniqueLoader)
    elif suffix.lower()=='.json':data=json.loads(text)
    else:raise ValueError('Use .yaml, .yml or legacy .json configuration')
    if not isinstance(data,dict):raise ValueError('Configuration must be a mapping')
    json.dumps(data,allow_nan=False)  # Reject non-finite values and non-JSON scalars.
    return data


def load_config(path):
    path=Path(path)
    return parse_config(path.read_bytes(),path.suffix)
