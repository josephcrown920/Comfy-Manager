import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest import mock


LAUNCHER_PATH = pathlib.Path(__file__).with_name("comfyui_launcher.py")
SPEC = importlib.util.spec_from_file_location("comfyui_launcher", LAUNCHER_PATH)
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


class FakeResponse:
    def __init__(self, payload, status=200):
        self.status = status
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode()


class CheckNodePacksTests(unittest.TestCase):
    def capture_check(self, caps, response):
        output = io.StringIO()
        with mock.patch.object(launcher.urllib.request, "urlopen", return_value=response):
            with contextlib.redirect_stdout(output):
                result = launcher.check_node_packs(caps)
        return result, output.getvalue()

    def test_returns_true_when_all_requested_sentinels_are_registered(self):
        response = FakeResponse({
            "VHS_VideoCombine": {},
            "LatentSyncNode": {},
            "ColorCorrect": {},
        })

        result, output = self.capture_check(["lipsync"], response)

        self.assertTrue(result)
        self.assertIn("[nodes] verified 3 custom node pack sentinels.", output)
        self.assertNotIn("WARNING", output)

    def test_lists_pack_and_node_for_each_missing_sentinel(self):
        response = FakeResponse({"VHS_VideoCombine": {}})

        result, output = self.capture_check(["lipsync"], response)

        self.assertFalse(result)
        self.assertIn("CUSTOM NODE PACKS FAILED TO REGISTER", output)
        self.assertIn("ComfyUI-LatentSyncWrapper: LatentSyncNode", output)
        self.assertIn("comfyui-art-venture: ColorCorrect", output)

    def test_probe_failure_is_a_non_blocking_warning(self):
        output = io.StringIO()
        with mock.patch.object(
            launcher.urllib.request,
            "urlopen",
            side_effect=OSError("connection reset"),
        ):
            with contextlib.redirect_stdout(output):
                result = launcher.check_node_packs(["motion"])

        self.assertFalse(result)
        self.assertIn("COULD NOT VERIFY CUSTOM NODE PACKS", output.getvalue())
        self.assertIn("connection reset", output.getvalue())


if __name__ == "__main__":
    unittest.main()