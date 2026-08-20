(function (global) {
  'use strict';

  var DEFAULT_DEVICE_NAME = '4803012MNBV230224842';
  var state = { device: null, server: null, characteristics: {}, serviceCount: 0, logs: [] };
  var elements = {};
  var standardOptionalServices = ['battery_service', 'device_information', 'generic_access', 'generic_attribute'];

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function now() { return new Date().toLocaleTimeString([], { hour12: false }); }
  function bytesToHex(dataView) {
    var bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0').toUpperCase();
    }).join(' ');
  }
  function parseOptionalServices(input) {
    return input.split(/[\s,]+/).map(function (value) { return value.trim(); }).filter(Boolean);
  }
  function propertyNames(properties) {
    var names = [];
    if (properties.read) names.push('read');
    if (properties.write) names.push('write');
    if (properties.writeWithoutResponse) names.push('writeWithoutResponse');
    if (properties.notify) names.push('notify');
    if (properties.indicate) names.push('indicate');
    return names;
  }
  function log(direction, message) {
    state.logs.push({ time: now(), direction: direction, message: message });
    state.logs = state.logs.slice(-120);
    renderLog();
  }
  function setStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = 'pill ' + (type || 'gray');
  }
  function renderLog() {
    elements.log.textContent = state.logs.map(function (entry) {
      return entry.time + '  ' + entry.direction + '  ' + entry.message;
    }).join('\n');
    elements.log.scrollTop = elements.log.scrollHeight;
  }
  function renderDevice() {
    if (!state.device) {
      elements.deviceName.textContent = '未选择设备';
      elements.deviceId.textContent = '点击连接后选择附近 BLE 设备';
      elements.connect.disabled = false;
      elements.disconnect.disabled = true;
      return;
    }
    elements.deviceName.textContent = state.device.name || '未命名设备';
    elements.deviceId.textContent = state.device.id || '浏览器未提供地址';
    elements.connect.disabled = !!state.server;
    elements.disconnect.disabled = !state.server;
  }
  function renderCharacteristics() {
    var keys = Object.keys(state.characteristics);
    elements.serviceCount.textContent = state.serviceCount + ' 个服务 · ' + keys.length + ' 个特征';
    if (!keys.length) {
      elements.characteristics.innerHTML = '<div class="set-desc">连接后显示 GATT 特征。</div>';
      return;
    }
    elements.characteristics.innerHTML = keys.map(function (key) {
      var item = state.characteristics[key];
      var readButton = item.properties.indexOf('read') >= 0
        ? '<button class="btn blue ble-read-btn" data-ble-read="' + escapeHtml(key) + '">读取</button>' : '';
      return '<div class="ble-characteristic"><div class="ble-characteristic-main">'
        + '<div class="ble-uuid">' + escapeHtml(item.characteristic.uuid) + '</div>'
        + '<div class="ble-meta">Service ' + escapeHtml(item.service.uuid) + ' · ' + escapeHtml(item.properties.join(', ')) + '</div>'
        + '</div>' + readButton + '</div>';
    }).join('');
  }
  function resetGattState() {
    state.server = null;
    state.characteristics = {};
    state.serviceCount = 0;
    renderDevice();
    renderCharacteristics();
  }
  function onDisconnected() {
    log('系统', '设备已断开');
    resetGattState();
    setStatus('已断开', 'gray');
  }
  function subscribeCharacteristic(item) {
    var characteristic = item.characteristic;
    if (item.properties.indexOf('notify') < 0 && item.properties.indexOf('indicate') < 0) return Promise.resolve();
    characteristic.addEventListener('characteristicvaluechanged', function () {
      log('← ' + characteristic.uuid, bytesToHex(characteristic.value) || '(空数据)');
    });
    return characteristic.startNotifications().then(function () {
      log('系统', '已订阅 ' + characteristic.uuid);
    }).catch(function (error) {
      log('系统', '订阅失败 ' + characteristic.uuid + ': ' + error.message);
    });
  }
  function discoverServices() {
    return state.server.getPrimaryServices().then(function (services) {
      state.serviceCount = services.length;
      log('系统', '发现 ' + services.length + ' 个 Primary Service');
      return Promise.all(services.map(function (service) {
        return service.getCharacteristics().then(function (characteristics) {
          return Promise.all(characteristics.map(function (characteristic) {
            var item = { service: service, characteristic: characteristic, properties: propertyNames(characteristic.properties || {}) };
            state.characteristics[service.uuid + '/' + characteristic.uuid] = item;
            return subscribeCharacteristic(item);
          }));
        });
      })).then(function () {
        renderCharacteristics();
        setStatus('已连接 · GATT 就绪', 'green');
      });
    }).catch(function (error) {
      setStatus('已连接但服务不可访问', 'orange');
      log('错误', error.message + '；请填写自定义 Service UUID 后重试');
    });
  }
  function connect() {
    if (!navigator.bluetooth) {
      setStatus('Safari 不支持网页 BLE', 'orange');
      log('提示', '请在小米手机 Chrome 中打开工作台；Edge iOS 需要原生 App');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('需要 HTTPS 页面', 'orange');
      log('错误', 'Web Bluetooth 不能在普通 HTTP 页面使用');
      return;
    }
    var targetName = elements.targetName.value.trim() || DEFAULT_DEVICE_NAME;
    var optionalServices = standardOptionalServices.concat(parseOptionalServices(elements.serviceUuid.value));
    var options = { filters: [{ name: targetName }], optionalServices: optionalServices };
    setStatus('等待选择目标电池', 'blue');
    log('系统', '按名称筛选：' + targetName);
    return navigator.bluetooth.requestDevice(options).then(function (device) {
      state.device = device;
      state.device.addEventListener('gattserverdisconnected', onDisconnected);
      renderDevice();
      setStatus('正在连接', 'blue');
      log('系统', '选择设备：' + (device.name || '未命名设备'));
      if (!device.gatt) throw new Error('设备不支持 GATT');
      return device.gatt.connect();
    }).then(function (server) {
      state.server = server;
      renderDevice();
      log('系统', 'GATT Server 已连接');
      return discoverServices();
    }).catch(function (error) {
      if (error.name === 'NotFoundError') {
        setStatus('已取消选择', 'gray');
        log('系统', '未选择设备或筛选不到目标名称');
      } else {
        setStatus('连接失败', 'orange');
        log('错误', error.message || String(error));
      }
    });
  }
  function disconnect() {
    if (state.device && state.device.gatt && state.device.gatt.connected) state.device.gatt.disconnect();
    else onDisconnected();
  }
  function readCharacteristic(key) {
    var item = state.characteristics[key];
    if (!item) return;
    item.characteristic.readValue().then(function (value) {
      log('← ' + item.characteristic.uuid, bytesToHex(value) || '(空数据)');
    }).catch(function (error) {
      log('错误', '读取失败 ' + item.characteristic.uuid + ': ' + error.message);
    });
  }
  function init() {
    elements = {
      status: byId('bleStatus'), targetName: byId('bleTargetNameInput'), serviceUuid: byId('bleServiceUuidInput'),
      deviceName: byId('bleDeviceName'), deviceId: byId('bleDeviceId'), serviceCount: byId('bleServiceCount'),
      characteristics: byId('bleCharacteristicList'), log: byId('bleLog'), connect: byId('bleConnectBtn'),
      disconnect: byId('bleDisconnectBtn'), clear: byId('bleClearBtn')
    };
    if (!elements.status) return;
    elements.connect.addEventListener('click', connect);
    elements.disconnect.addEventListener('click', disconnect);
    elements.clear.addEventListener('click', function () { state.logs = []; renderLog(); });
    elements.characteristics.addEventListener('click', function (event) {
      var button = event.target.closest('[data-ble-read]');
      if (button) readCharacteristic(button.dataset.bleRead);
    });
    renderDevice();
    renderCharacteristics();
    log('提示', '目标名称已预填；当前只连接、订阅和记录原始数据');
    if (!navigator.bluetooth) {
      setStatus('当前浏览器需原生 App', 'orange');
      log('提示', 'Edge iOS 可添加到桌面，但不能直接连接 BLE；请用小米 Chrome 测试');
    }
  }
  global.BluetoothWorkbench = { init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
