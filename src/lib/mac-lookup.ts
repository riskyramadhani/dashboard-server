import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface MacLookupResult {
  macAddress: string;
  ouiPrefix: string;
  vendor: string;
  companyAddress?: string;
  country?: string;
  isPrivate: boolean; // Locally Administered Address (LAA / Randomized / Virtual)
  isMulticast: boolean;
  isBroadcast: boolean;
  source: "OFFLINE_DATABASE" | "LIVE_API" | "ARP_RESOLVED";
  resolvedFromIp?: string;
  formats: {
    colon: string; // 00:1A:2B:3C:4D:5E
    hyphen: string; // 00-1A-2B-3C-4D-5E
    cisco: string; // 001a.2b3c.4d5e
    raw: string; // 001A2B3C4D5E
  };
}

// Curated high-precision enterprise, network, server, IoT, and virtualization OUI dictionary
const OUI_DATABASE: Record<string, { vendor: string; country?: string }> = {
  // Cisco Systems
  "00:00:0C": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:01:42": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:01:43": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:01:96": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:01:97": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:01:C7": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:01:C9": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:16": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:17": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:4A": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:4B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:7D": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:7E": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:8A": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:02:B9": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:03:6B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:04:4D": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:05:31": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:05:73": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:06:52": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:07:0E": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:08:20": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:08:E2": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:0C:85": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:0D:BC": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:0E:38": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:0E:83": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:0F:23": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:10:07": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:10:11": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:10:7B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:11:20": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:11:5C": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:11:BB": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:12:00": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:12:43": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:12:7F": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:13:19": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:13:7F": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:14:1B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:14:69": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:15:2B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:16:46": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:16:9C": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:17:0E": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:17:59": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:18:18": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:18:73": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:19:06": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:19:2F": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:19:55": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1A:2F": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1A:6C": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1B:0C": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1B:2A": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1B:53": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1C:0E": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1D:45": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1E:13": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:1F:26": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:21:1B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:22:55": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:23:04": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:24:13": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:25:45": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:26:0B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:26:98": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:27:0C": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:2A:6A": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:3A:9A": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:42:68": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:50:0F": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:62:EC": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:78:88": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:81:C4": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:90:BF": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:A2:89": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:B0:64": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:C8:8B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:D0:BA": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:E0:14": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:F2:8B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "00:F6:63": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "28:52:61": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "34:BD:C8": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "40:55:39": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "58:97:1E": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "64:A0:E7": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "70:70:8B": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "84:78:AC": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "A8:B4:56": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "C4:72:95": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "CC:D5:39": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "E8:BA:70": { vendor: "Cisco Systems, Inc.", country: "United States" },
  "F4:CF:E2": { vendor: "Cisco Systems, Inc.", country: "United States" },

  // Fortinet
  "00:09:0F": { vendor: "Fortinet, Inc.", country: "United States" },
  "08:5B:0E": { vendor: "Fortinet, Inc.", country: "United States" },
  "70:4C:A5": { vendor: "Fortinet, Inc.", country: "United States" },
  "90:6C:AC": { vendor: "Fortinet, Inc.", country: "United States" },
  "04:D5:90": { vendor: "Fortinet, Inc.", country: "United States" },
  "84:06:55": { vendor: "Fortinet, Inc.", country: "United States" },
  "94:F3:92": { vendor: "Fortinet, Inc.", country: "United States" },
  "B0:C6:9A": { vendor: "Fortinet, Inc.", country: "United States" },
  "E8:1D:A8": { vendor: "Fortinet, Inc.", country: "United States" },

  // MikroTik
  "00:0C:42": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "48:8B:0A": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "64:D1:54": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "74:4D:28": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "B8:69:F4": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "C4:AD:34": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "D4:01:C3": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "D4:CA:6D": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "E4:8D:8C": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "08:55:31": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "18:FD:74": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "2C:C8:1B": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "F4:1E:26": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },
  "CC:2D:E0": { vendor: "MikroTik (SIA Mikrotikls)", country: "Latvia" },

  // Ubiquiti Networks
  "00:15:6D": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "00:27:22": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "04:18:D6": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "18:E8:29": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "24:A4:3C": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "44:D9:E7": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "60:22:32": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "68:72:51": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "74:83:C2": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "78:8A:20": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "80:2A:A8": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "B4:FB:E4": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "DC:9F:DB": { vendor: "Ubiquiti Networks Inc.", country: "United States" },
  "F0:9F:C2": { vendor: "Ubiquiti Networks Inc.", country: "United States" },

  // Ruijie Networks / Reyee
  "00:1A:A9": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "14:14:4B": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "30:0D:43": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "58:69:6C": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "70:81:05": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "74:05:A5": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "80:05:88": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "98:0D:2E": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },
  "BC:BA:C2": { vendor: "Ruijie Networks Co., Ltd.", country: "China" },

  // Huawei Technologies
  "00:18:82": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "00:1E:10": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "00:25:9E": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "20:0B:C7": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "24:69:A5": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "28:6E:D4": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "48:46:FB": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "54:89:98": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "70:7B:E8": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },
  "80:B6:86": { vendor: "Huawei Technologies Co., Ltd.", country: "China" },

  // Sangfor Technologies
  "AC:7F:3E": { vendor: "Sangfor Technologies Inc.", country: "China" },
  "00:22:93": { vendor: "Sangfor Technologies Inc.", country: "China" },

  // Palo Alto Networks
  "00:1B:17": { vendor: "Palo Alto Networks", country: "United States" },
  "08:30:6B": { vendor: "Palo Alto Networks", country: "United States" },
  "D4:F4:BE": { vendor: "Palo Alto Networks", country: "United States" },
  "E4:A7:49": { vendor: "Palo Alto Networks", country: "United States" },

  // Juniper Networks
  "00:05:85": { vendor: "Juniper Networks", country: "United States" },
  "00:10:DB": { vendor: "Juniper Networks", country: "United States" },
  "00:12:1E": { vendor: "Juniper Networks", country: "United States" },
  "00:19:E2": { vendor: "Juniper Networks", country: "United States" },
  "00:21:59": { vendor: "Juniper Networks", country: "United States" },
  "2C:6B:F5": { vendor: "Juniper Networks", country: "United States" },
  "40:B4:F0": { vendor: "Juniper Networks", country: "United States" },
  "54:E0:32": { vendor: "Juniper Networks", country: "United States" },

  // Hewlett Packard Enterprise / HP / Aruba
  "00:01:E6": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:01:E7": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:08:02": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:0B:CD": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:0E:7F": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:11:85": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:12:79": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:14:38": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:15:60": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:16:35": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:17:A4": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:18:FE": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:19:BB": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:1A:4B": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:1B:78": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:1C:C4": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:1E:0B": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:21:5A": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:22:64": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:23:7D": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:24:81": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "00:25:B3": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "04:75:07": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "10:E7:C6": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "14:02:EC": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "20:67:7C": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "24:BE:05": { vendor: "Aruba Networks (an HPE Company)", country: "United States" },
  "28:92:4A": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "30:8D:99": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "38:63:BB": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "40:A8:F0": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "48:0F:CF": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "50:65:F3": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "58:20:B1": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "64:51:06": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "68:B5:99": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "70:10:6F": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "78:E3:B5": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "80:C1:6E": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "84:34:97": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "88:D7:F6": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "94:57:A5": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "A0:D3:C1": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "B4:99:BA": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "C4:34:6B": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "D8:9D:67": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "E0:07:1B": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "F4:03:43": { vendor: "Hewlett Packard Enterprise", country: "United States" },
  "F8:66:F2": { vendor: "Hewlett Packard Enterprise", country: "United States" },

  // Dell Inc.
  "00:06:5B": { vendor: "Dell Inc.", country: "United States" },
  "00:08:74": { vendor: "Dell Inc.", country: "United States" },
  "00:0B:DB": { vendor: "Dell Inc.", country: "United States" },
  "00:0D:56": { vendor: "Dell Inc.", country: "United States" },
  "00:0F:1F": { vendor: "Dell Inc.", country: "United States" },
  "00:11:43": { vendor: "Dell Inc.", country: "United States" },
  "00:12:3F": { vendor: "Dell Inc.", country: "United States" },
  "00:13:72": { vendor: "Dell Inc.", country: "United States" },
  "00:14:22": { vendor: "Dell Inc.", country: "United States" },
  "00:15:C5": { vendor: "Dell Inc.", country: "United States" },
  "00:16:F0": { vendor: "Dell Inc.", country: "United States" },
  "00:18:8B": { vendor: "Dell Inc.", country: "United States" },
  "00:19:B9": { vendor: "Dell Inc.", country: "United States" },
  "00:1A:A0": { vendor: "Dell Inc.", country: "United States" },
  "00:1C:23": { vendor: "Dell Inc.", country: "United States" },
  "00:1D:09": { vendor: "Dell Inc.", country: "United States" },
  "00:1E:4F": { vendor: "Dell Inc.", country: "United States" },
  "00:21:70": { vendor: "Dell Inc.", country: "United States" },
  "00:22:19": { vendor: "Dell Inc.", country: "United States" },
  "00:23:AE": { vendor: "Dell Inc.", country: "United States" },
  "00:24:E8": { vendor: "Dell Inc.", country: "United States" },
  "00:25:64": { vendor: "Dell Inc.", country: "United States" },
  "00:26:B9": { vendor: "Dell Inc.", country: "United States" },
  "14:18:77": { vendor: "Dell Inc.", country: "United States" },
  "18:03:73": { vendor: "Dell Inc.", country: "United States" },
  "18:66:DA": { vendor: "Dell Inc.", country: "United States" },
  "24:B6:FD": { vendor: "Dell Inc.", country: "United States" },
  "28:F1:0E": { vendor: "Dell Inc.", country: "United States" },
  "34:17:EB": { vendor: "Dell Inc.", country: "United States" },
  "44:A8:42": { vendor: "Dell Inc.", country: "United States" },
  "54:9F:35": { vendor: "Dell Inc.", country: "United States" },
  "74:86:7A": { vendor: "Dell Inc.", country: "United States" },
  "78:2B:CB": { vendor: "Dell Inc.", country: "United States" },
  "84:2B:2B": { vendor: "Dell Inc.", country: "United States" },
  "90:B1:1C": { vendor: "Dell Inc.", country: "United States" },
  "A4:BA:DB": { vendor: "Dell Inc.", country: "United States" },
  "B0:83:FE": { vendor: "Dell Inc.", country: "United States" },
  "B8:2A:72": { vendor: "Dell Inc.", country: "United States" },
  "BC:30:5B": { vendor: "Dell Inc.", country: "United States" },
  "C8:1F:66": { vendor: "Dell Inc.", country: "United States" },
  "D0:67:E5": { vendor: "Dell Inc.", country: "United States" },
  "D4:AE:52": { vendor: "Dell Inc.", country: "United States" },
  "D8:9E:F3": { vendor: "Dell Inc.", country: "United States" },
  "E4:F0:04": { vendor: "Dell Inc.", country: "United States" },
  "F0:1F:AF": { vendor: "Dell Inc.", country: "United States" },
  "F4:8E:38": { vendor: "Dell Inc.", country: "United States" },
  "F8:BC:12": { vendor: "Dell Inc.", country: "United States" },

  // VMware Virtualization
  "00:05:69": { vendor: "VMware, Inc. (Virtual)", country: "United States" },
  "00:0C:29": { vendor: "VMware, Inc. (ESXi/Workstation)", country: "United States" },
  "00:1C:14": { vendor: "VMware, Inc. (Virtual)", country: "United States" },
  "00:50:56": { vendor: "VMware, Inc. (vSphere/vCenter)", country: "United States" },

  // Microsoft Hyper-V / Azure
  "00:03:FF": { vendor: "Microsoft Corporation (Hyper-V)", country: "United States" },
  "00:0D:3A": { vendor: "Microsoft Corporation (Azure Virtual)", country: "United States" },
  "00:12:5A": { vendor: "Microsoft Corporation", country: "United States" },
  "00:15:5D": { vendor: "Microsoft Corporation (Hyper-V Virtual)", country: "United States" },
  "00:17:FA": { vendor: "Microsoft Corporation", country: "United States" },
  "00:1D:D8": { vendor: "Microsoft Corporation", country: "United States" },

  // Intel Corporation
  "00:02:B3": { vendor: "Intel Corporation", country: "United States" },
  "00:03:47": { vendor: "Intel Corporation", country: "United States" },
  "00:04:23": { vendor: "Intel Corporation", country: "United States" },
  "00:07:E9": { vendor: "Intel Corporation", country: "United States" },
  "00:0E:0C": { vendor: "Intel Corporation", country: "United States" },
  "00:11:11": { vendor: "Intel Corporation", country: "United States" },
  "00:13:02": { vendor: "Intel Corporation", country: "United States" },
  "00:13:20": { vendor: "Intel Corporation", country: "United States" },
  "00:15:00": { vendor: "Intel Corporation", country: "United States" },
  "00:15:17": { vendor: "Intel Corporation", country: "United States" },
  "00:16:76": { vendor: "Intel Corporation", country: "United States" },
  "00:18:DE": { vendor: "Intel Corporation", country: "United States" },
  "00:19:D1": { vendor: "Intel Corporation", country: "United States" },
  "00:1B:21": { vendor: "Intel Corporation", country: "United States" },
  "00:1C:C0": { vendor: "Intel Corporation", country: "United States" },
  "00:1D:E0": { vendor: "Intel Corporation", country: "United States" },
  "00:1E:64": { vendor: "Intel Corporation", country: "United States" },
  "00:1E:67": { vendor: "Intel Corporation", country: "United States" },
  "00:1F:3B": { vendor: "Intel Corporation", country: "United States" },
  "00:21:5C": { vendor: "Intel Corporation", country: "United States" },
  "00:21:6A": { vendor: "Intel Corporation", country: "United States" },
  "00:22:FB": { vendor: "Intel Corporation", country: "United States" },
  "00:23:14": { vendor: "Intel Corporation", country: "United States" },
  "00:24:D7": { vendor: "Intel Corporation", country: "United States" },
  "34:13:E8": { vendor: "Intel Corporation", country: "United States" },
  "3C:FD:FE": { vendor: "Intel Corporation", country: "United States" },
  "48:51:B7": { vendor: "Intel Corporation", country: "United States" },
  "68:05:CA": { vendor: "Intel Corporation", country: "United States" },
  "80:86:F2": { vendor: "Intel Corporation", country: "United States" },
  "A0:36:9F": { vendor: "Intel Corporation", country: "United States" },

  // Surveillance & IoT (Hikvision, Dahua)
  "00:18:AE": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "10:BF:48": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "18:68:CB": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "24:28:FD": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "28:57:BE": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "40:B0:34": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "44:19:B6": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "4C:BD:8F": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "54:C4:15": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "8C:E7:48": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "A0:BD:1D": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "BC:54:36": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },
  "C0:56:E3": { vendor: "Hangzhou Hikvision Digital Technology", country: "China" },

  "00:12:12": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "14:A7:8B": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "38:AF:29": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "3C:EF:8C": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "4C:11:BF": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "58:63:9A": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "90:02:A9": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "B0:C5:54": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "BC:24:11": { vendor: "Zhejiang Dahua Technology", country: "China" },
  "C4:B3:6A": { vendor: "Zhejiang Dahua Technology", country: "China" },

  // Storage / NAS (Synology, QNAP)
  "00:11:32": { vendor: "Synology Incorporated", country: "Taiwan" },
  "00:08:9B": { vendor: "QNAP Systems, Inc.", country: "Taiwan" },
  "24:5E:BE": { vendor: "QNAP Systems, Inc.", country: "Taiwan" },

  // Raspberry Pi
  "B8:27:EB": { vendor: "Raspberry Pi Foundation", country: "United Kingdom" },
  "DC:A6:32": { vendor: "Raspberry Pi Foundation", country: "United Kingdom" },
  "E4:5F:01": { vendor: "Raspberry Pi Foundation", country: "United Kingdom" },
  "28:CD:C1": { vendor: "Raspberry Pi Foundation", country: "United Kingdom" },

  // Apple Inc.
  "00:03:93": { vendor: "Apple, Inc.", country: "United States" },
  "00:05:02": { vendor: "Apple, Inc.", country: "United States" },
  "00:0A:27": { vendor: "Apple, Inc.", country: "United States" },
  "00:0A:95": { vendor: "Apple, Inc.", country: "United States" },
  "00:0D:93": { vendor: "Apple, Inc.", country: "United States" },
  "00:11:24": { vendor: "Apple, Inc.", country: "United States" },
  "00:14:51": { vendor: "Apple, Inc.", country: "United States" },
  "00:16:CB": { vendor: "Apple, Inc.", country: "United States" },
  "00:17:F2": { vendor: "Apple, Inc.", country: "United States" },
  "00:19:E3": { vendor: "Apple, Inc.", country: "United States" },
  "00:1B:63": { vendor: "Apple, Inc.", country: "United States" },
  "00:1C:B3": { vendor: "Apple, Inc.", country: "United States" },
  "00:1D:4F": { vendor: "Apple, Inc.", country: "United States" },
  "00:1E:52": { vendor: "Apple, Inc.", country: "United States" },
  "00:1F:5B": { vendor: "Apple, Inc.", country: "United States" },
  "00:21:E9": { vendor: "Apple, Inc.", country: "United States" },
  "00:22:41": { vendor: "Apple, Inc.", country: "United States" },
  "00:23:12": { vendor: "Apple, Inc.", country: "United States" },
  "00:24:36": { vendor: "Apple, Inc.", country: "United States" },
  "00:25:00": { vendor: "Apple, Inc.", country: "United States" },
  "00:26:08": { vendor: "Apple, Inc.", country: "United States" },
  "04:0C:CE": { vendor: "Apple, Inc.", country: "United States" },
  "04:15:52": { vendor: "Apple, Inc.", country: "United States" },
  "08:70:45": { vendor: "Apple, Inc.", country: "United States" },
  "14:10:9F": { vendor: "Apple, Inc.", country: "United States" },
  "20:76:8F": { vendor: "Apple, Inc.", country: "United States" },
  "28:CF:E9": { vendor: "Apple, Inc.", country: "United States" },
  "34:15:9E": { vendor: "Apple, Inc.", country: "United States" },
  "3C:07:54": { vendor: "Apple, Inc.", country: "United States" },
  "40:6C:8F": { vendor: "Apple, Inc.", country: "United States" },
  "4C:32:75": { vendor: "Apple, Inc.", country: "United States" },
  "54:26:96": { vendor: "Apple, Inc.", country: "United States" },
  "60:03:08": { vendor: "Apple, Inc.", country: "United States" },
  "68:96:7B": { vendor: "Apple, Inc.", country: "United States" },
  "70:EC:E4": { vendor: "Apple, Inc.", country: "United States" },
  "7C:6D:62": { vendor: "Apple, Inc.", country: "United States" },
  "88:66:A5": { vendor: "Apple, Inc.", country: "United States" },
  "A4:83:E7": { vendor: "Apple, Inc.", country: "United States" },
  "AC:87:A3": { vendor: "Apple, Inc.", country: "United States" },
  "B8:78:26": { vendor: "Apple, Inc.", country: "United States" },
  "C8:2A:14": { vendor: "Apple, Inc.", country: "United States" },
  "D0:23:DB": { vendor: "Apple, Inc.", country: "United States" },
  "D8:9E:3F": { vendor: "Apple, Inc.", country: "United States" },
  "E0:B9:BA": { vendor: "Apple, Inc.", country: "United States" },
  "F0:18:98": { vendor: "Apple, Inc.", country: "United States" },

  // Industrial Networking (Siemens, Schneider, Moxa)
  "00:0E:8C": { vendor: "Siemens AG", country: "Germany" },
  "00:1B:1B": { vendor: "Siemens AG", country: "Germany" },
  "00:1C:06": { vendor: "Siemens AG", country: "Germany" },
  "00:00:54": { vendor: "Schneider Electric", country: "France" },
  "00:80:F4": { vendor: "Schneider Electric", country: "France" },
  "00:90:E8": { vendor: "Moxa Inc.", country: "Taiwan" },
  "00:A0:45": { vendor: "Phoenix Contact GmbH & Co. KG", country: "Germany" },
  "00:80:63": { vendor: "Hirschmann Automation and Control GmbH", country: "Germany" },

  // Popular Commercial Networking (TP-Link, D-Link)
  "00:0A:EB": { vendor: "TP-Link Corporation Limited", country: "China" },
  "00:14:78": { vendor: "TP-Link Corporation Limited", country: "China" },
  "00:19:E0": { vendor: "TP-Link Corporation Limited", country: "China" },
  "00:21:27": { vendor: "TP-Link Corporation Limited", country: "China" },
  "14:CC:20": { vendor: "TP-Link Corporation Limited", country: "China" },
  "30:B5:C2": { vendor: "TP-Link Corporation Limited", country: "China" },
  "50:C7:BF": { vendor: "TP-Link Corporation Limited", country: "China" },
  "60:A4:4C": { vendor: "TP-Link Corporation Limited", country: "China" },
  "64:70:02": { vendor: "TP-Link Corporation Limited", country: "China" },
  "84:16:F9": { vendor: "TP-Link Corporation Limited", country: "China" },
  "90:F6:52": { vendor: "TP-Link Corporation Limited", country: "China" },
  "B0:4E:26": { vendor: "TP-Link Corporation Limited", country: "China" },
  "C4:6E:1F": { vendor: "TP-Link Corporation Limited", country: "China" },
  "D8:0D:17": { vendor: "TP-Link Corporation Limited", country: "China" },
  "E8:48:B8": { vendor: "TP-Link Corporation Limited", country: "China" },

  "00:05:5D": { vendor: "D-Link Corporation", country: "Taiwan" },
  "00:0D:88": { vendor: "D-Link Corporation", country: "Taiwan" },
  "00:13:46": { vendor: "D-Link Corporation", country: "Taiwan" },
  "00:15:E9": { vendor: "D-Link Corporation", country: "Taiwan" },
  "00:17:9A": { vendor: "D-Link Corporation", country: "Taiwan" },
  "00:1B:11": { vendor: "D-Link Corporation", country: "Taiwan" },
  "00:1E:58": { vendor: "D-Link Corporation", country: "Taiwan" },
  "1C:7E:E5": { vendor: "D-Link Corporation", country: "Taiwan" },
  "28:10:7B": { vendor: "D-Link Corporation", country: "Taiwan" },
};

/**
 * Resolves local IP to MAC Address using the OS ARP cache table
 */
export async function resolveArp(ip: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("arp", ["-n", ip], { timeout: 3000 });
    // Match common ARP formats:
    // macOS: ? (172.20.10.1) at 7a:3f:4d:a8:c8:64 on en0 ifscope [ethernet]
    // Linux: ? (192.168.1.1) at 00:11:22:33:44:55 [ether] on eth0
    const match = stdout.match(/at\s+([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})/i);
    if (match) {
      // Normalize octets to 2-digit hex
      const clean = match[1]
        .split(":")
        .map((octet) => octet.padStart(2, "0"))
        .join(":");
      return clean.toUpperCase();
    }
  } catch {
    // Silent fail if ARP has no entry
  }
  return null;
}

/**
 * Normalizes any valid MAC address representation into uppercase clean hex
 */
export function normalizeMac(input: string): string | null {
  const trimmed = input.trim();
  // Strip all standard separators: colon, hyphen, dot, spaces
  const cleanHex = trimmed.replace(/[:.\-\s]/g, "").toUpperCase();

  // Valid MAC must be 12 hex characters (48-bit) or 16 hex characters (64-bit EUI-64)
  if (!/^[0-9A-F]{12}$|^[0-9A-F]{16}$/.test(cleanHex)) {
    return null;
  }

  return cleanHex;
}

/**
 * Queries public IEEE / maclookup API if not found in offline dictionary
 */
async function queryOnlineApi(cleanMac: string): Promise<{ vendor: string; country?: string; address?: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`https://api.maclookup.app/v2/macs/${cleanMac}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.found && data.company) {
        return {
          vendor: data.company,
          country: data.country || undefined,
          address: data.address || undefined,
        };
      }
    }
  } catch {
    // Fallback failure is non-blocking
  }
  return null;
}

/**
 * Core MAC Address lookup function with hybrid offline database, bit analysis, and ARP resolution
 */
export async function lookupMacAddress(target: string): Promise<MacLookupResult> {
  const trimmed = target.trim();
  let resolvedFromIp: string | undefined;
  let targetMac = trimmed;

  // 1. Check if user passed an IPv4 address (e.g. 192.168.1.1)
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(trimmed);
  if (isIpv4) {
    const resolved = await resolveArp(trimmed);
    if (!resolved) {
      throw new Error(`IP ${trimmed} tidak ditemukan pada ARP cache server. Pastikan perangkat berada di subnet lokal dan aktif.`);
    }
    resolvedFromIp = trimmed;
    targetMac = resolved;
  }

  // 2. Normalize MAC
  const cleanHex = normalizeMac(targetMac);
  if (!cleanHex) {
    throw new Error(`Format MAC Address tidak valid: "${targetMac}". Gunakan format seperti 00:1A:2B:3C:4D:5E atau IP lokal.`);
  }

  // Generate standard formats
  const chunks = cleanHex.match(/.{1,2}/g) || [];
  const colonFormat = chunks.join(":");
  const hyphenFormat = chunks.join("-");
  const ciscoFormat = `${cleanHex.slice(0, 4)}.${cleanHex.slice(4, 8)}.${cleanHex.slice(8, 12)}`.toLowerCase();

  // 3. Bit analysis (First Byte)
  const firstByte = parseInt(cleanHex.slice(0, 2), 16);
  const isMulticast = (firstByte & 0x01) !== 0;
  const isPrivate = (firstByte & 0x02) !== 0; // Locally Administered Address (Randomized / Private MAC)
  const isBroadcast = cleanHex === "FFFFFFFFFFFF";

  // 4. Extract OUI Prefix (First 6 hex chars = 3 octets)
  const ouiPrefix = `${cleanHex.slice(0, 2)}:${cleanHex.slice(2, 4)}:${cleanHex.slice(4, 6)}`;

  let vendor = "Pabrikan Tidak Dikenal (Unknown Vendor)";
  let country: string | undefined;
  let companyAddress: string | undefined;
  let source: MacLookupResult["source"] = "OFFLINE_DATABASE";

  // Check special cases
  if (isBroadcast) {
    vendor = "Ethernet Broadcast Address (Semua Perangkat)";
  } else if (isMulticast) {
    vendor = "Multicast Address Group";
  } else if (isPrivate) {
    vendor = "Locally Administered / Randomized MAC (Perangkat Pribadi / Virtual)";
  } else if (OUI_DATABASE[ouiPrefix]) {
    vendor = OUI_DATABASE[ouiPrefix].vendor;
    country = OUI_DATABASE[ouiPrefix].country;
    source = "OFFLINE_DATABASE";
  } else {
    // 5. Query Online Fallback API
    const liveData = await queryOnlineApi(cleanHex);
    if (liveData) {
      vendor = liveData.vendor;
      country = liveData.country;
      companyAddress = liveData.address;
      source = "LIVE_API";
    }
  }

  if (resolvedFromIp) {
    source = "ARP_RESOLVED";
  }

  return {
    macAddress: colonFormat,
    ouiPrefix,
    vendor,
    companyAddress,
    country,
    isPrivate,
    isMulticast,
    isBroadcast,
    source,
    resolvedFromIp,
    formats: {
      colon: colonFormat,
      hyphen: hyphenFormat,
      cisco: ciscoFormat,
      raw: cleanHex,
    },
  };
}
