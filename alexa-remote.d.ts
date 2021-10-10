declare module "alexa-remote2" {
  export type InitOptions =
    | string
    | Partial<{
        cookie: string;
        email: string;
        password: string;
        proxyOnly: boolean;
        proxyOwnIp: string;
        proxyPort: number;
        proxyLogLevel: string;
        bluetooth: boolean;
        logger: (...args: any[]) => void;
        alexaServiceHost: string;
        userAgent: string;
        acceptLanguage: string;
        amazonPage: string;
        useWsMqtt: boolean;
        cookieRefreshInterval: number;
      }>;

  export type AppDevice = {
    deviceAccountId: string;
    deviceType: string;
    serialNumber: string;
  };

  export type Serial = {
    accountName: string;
    appDeviceList: AppDevice[];
    capabilities: string[];
    charging: string;
    deviceAccountId: string;
    deviceFamily: string;
    deviceOwnerCustomerId: string;
    deviceType: string;
    deviceTypeFriendlyName: string;
    essid: string;
    language: string;
    macAddress: string;
    online: boolean;
    postalCode: string;
    registrationId: string;
    remainingBatteryLevel: string;
    serialNumber: string;
    softwareVersion: string;
    isControllable: boolean;
    hasMusicPlayer: boolean;
    isMultiroomDevice: boolean;
    isMultiroomMember: boolean;
    wakeWord: string;
  };

  export type CallbackWithError = (err?: Error) => void;

  export type CallbackWithErrorAndBody = <T>(err?: Error, body?: T) => void;

  export type SerialOrName = Serial | string;

  export type Value = string | number | boolean;

  export type Sound = {
    displayName: string;
    folder: string;
    id: string;
    providerId: string;
    sampleUrl: string;
  };

  export type Status = "ON" | "OFF";

  export type Notification = {
    alarmTime: number;
    createdDate: number;
    deferredAtTime: number | null;
    deviceSerialNumber: string;
    deviceType: string;
    geoLocationTriggerData: string | null;
    id: string;
    musicAlarmId: string | null;
    musicEntity: string | null;
    notificationIndex: string;
    originalDate: string;
    originalTime: string;
    provider: strign | null;
    recurringPattern: string | null;
    remainingTime: number;
    reminderLabel: string | null;
    sound: Sound;
    status: Status;
    timeZoneId: string | null;
    timerLabel: string | null;
    triggerTime: number;
    type: string;
    version: string;
  };

  type GetContactsOptions = Partial<{
    includePreferencesByLevel: string;
    includeNonAlexaContacts: boolean;
    includeHomeGroupMembers: boolean;
    bulkImportOnly: boolean;
    includeBlockStatus: boolean;
    dedupeMode: string;
    homeGroupId: string;
  }>;

  export type ListItemOptions = Partial<{
    startTime: string;
    endTime: string;
    completed: string;
    listIds: string;
  }>;

  export type GetCustomerHistoryRecordsOptions = {
    startTime: number;
    endTime: number;
    recordType: string;
    maxRecordSize: number;
  };

  export type GetConversationsOptions = Partial<{
    latest: boolean;
    includeHomegroup: boolean;
    unread: boolean;
    modifiedSinceDate: string;
    includeUserName: boolean;
  }>;

  export type MessageCommands =
    | "play"
    | "pause"
    | "next"
    | "previous"
    | "forward"
    | "rewind"
    | "volume"
    | "shuffle"
    | "repeat";

  export type SequenceNodeCommand =
    | "weather"
    | "traffic"
    | "flashbriefing"
    | "goodmorning"
    | "funfact"
    | "joke"
    | "cleanup"
    | "singasong"
    | "tellstory"
    | "calendarToday"
    | "calendarTomorrow"
    | "calendarNext"
    | "textCommand"
    | "curatedtts"
    | "volume"
    | "deviceStop"
    | "speak"
    | "skill"
    | "notification"
    | "announcement"
    | "ssml";

  export type SequneceType = "SerialNode" | "ParallelNode";

  export type EntityType = "APPLIANCE" | "GROUP";

  export type MultiSequenceCommand = {
    command: SequenceNodeCommand;
    value: Value;
    device?: SerialOrName;
  };

  export default class AlexaRemote extends EventEmitter {
    serialNumbers: Record<string, Serial>;
    cookie?: string;
    csrf?: string;
    cookieData?: string;
    baseUrl: string;
    friendlyNames: Record<string, string>;
    names: Record<string, string>;
    lastAuthCheck: number | null;

    setCookie(_cookie: string): void;

    init(cookie: string | InitOptions, callback: CallbackWithError);

    prepare(callback: CallbackWithError): void;

    initNotifications(callback: CallbackWithError): void;

    initWakewords(callback: CallbackWithError): void;

    initDeviceState(callback: CallbackWithError): void;

    initBluetoothState(callback: CallbackWithError): void;

    initWsMqttConnection(): void;

    getPushedActivities(): void;

    stop(): void;

    generateCookie(
      email: string,
      password: string,
      callback: CallbackWithError
    ): void;

    refreshCookie(callback: CallbackWithError): void;

    httpsGet(
      noCheck: boolean,
      path: string,
      callback: CallbackWithError,
      flags: Record<string, any> = {}
    ): void;

    httpsGetCall(
      path: string,
      callback,
      callback: CallbackWithErrorAndBody,
      flags: Record<string, any> = {}
    ): void;

    /// Public
    checkAuthentication(callback: CallbackWithErrorAndBody): void;

    getDevices(callback: CallbackWithErrorAndBody): void;

    getCards(
      limit: number,
      beforeCreationTime: string,
      callback: CallbackWithErrorAndBody
    ): void;

    getMedia(
      serialOrName: SerialOrName,
      callback: CallbackWithErrorAndBody
    ): void;

    getPlayerInfo(
      serialOrName: SerialOrName,
      callback: CallbackWithErrorAndBody
    ): void;

    getLists(callback: CallbackWithErrorAndBody): void;

    getList(listId: string, callback: CallbackWithErrorAndBody): void;

    getListItems(
      listId: string,
      options: ListItemOptions,
      callback: CallbackWithErrorAndBody
    ): void;

    addListItem(
      listId: string,
      options: ListItemOptions,
      callback: CallbackWithErrorAndBody
    ): void;

    updateListItem(
      listId: string,
      listItem: string,
      options: ListItemOptions,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteListItem(
      listId: string,
      listItem: string,
      callback: CallbackWithErrorAndBody
    ): void;

    getWakeWords(callback: CallbackWithErrorAndBody): void;

    getReminders(cached: boolean, callback: CallbackWithErrorAndBody): void;

    getNotifications(cached: boolean, callback: CallbackWithErrorAndBody): void;

    getSkills(callback: CallbackWithErrorAndBody): void;

    createNotificationObject(
      serialOrName: SerialOrName,
      type: string,
      label: string,
      value: Value,
      status: Status,
      sound: string
    ): Notification;

    parseValue4Notification(
      notification: Notification,
      value: Value
    ): Notification;

    createNotification(
      notification: Notification,
      callback: CallbackWithErrorAndBody
    ): void;

    changeNotification(
      notification: Notification,
      value: Value,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteNotification(
      notification: Notification,
      callback: CallbackWithErrorAndBody
    ): void;

    getDoNotDisturb(callback: CallbackWithErrorAndBody): void;

    getDeviceStatusList(callback: CallbackWithErrorAndBody): void;

    // alarm volume
    getDeviceNotificationState(
      serialOrName: SerialOrName,
      callback: CallbackWithErrorAndBody
    ): void;

    getBluetooth(cached: boolean, callback: CallbackWithErrorAndBody): void;

    tuneinSearchRaw(query: string, callback: CallbackWithErrorAndBody): void;

    tuneinSearch(query: string, callback: CallbackWithErrorAndBody): void;

    setTunein(
      serialOrName: SerialOrName,
      guideId: string,
      contentType: string,
      callback: CallbackWithErrorAndBody
    ): void;

    getCustomerHistoryRecords(
      options: GetCustomerHistoryRecordsOptions,
      callback: CallbackWithErrorAndBody
    ): void;

    getAccount(callback: CallbackWithErrorAndBody): void;

    getContacts(
      options: GetContactsOptions,
      callback: CallbackWithErrorAndBody
    ): void;

    getConversations(
      options: GetConversationsOptions,
      callback: CallbackWithErrorAndBody
    ): void;

    connectBluetooth(
      serialOrName: SerialOrName,
      btAddress: string,
      callback: CallbackWithErrorAndBody
    ): void;

    disconnectBluetooth(
      serialOrName: SerialOrName,
      btAddress: string,
      callback: CallbackWithErrorAndBody
    ): void;

    setDoNotDisturb(
      serialOrName: SerialOrName,
      enabled: boolean,
      callback: CallbackWithErrorAndBody
    ): void;

    find(serialOrName: SerialOrName): SerialOrName | null;

    setAlarmVolume(
      serialOrName: SerialOrName,
      volume: number,
      callback: CallbackWithErrorAndBody
    ): void;

    sendCommand(
      serialOrName: SerialOrName,
      command: MessageCommands,
      value: Value,
      callback: CallbackWithErrorAndBody
    ): void;

    sendMessage(
      serialOrName: SerialOrName,
      command: MessageCommands,
      value: Value,
      callback: CallbackWithErrorAndBody
    ): void;

    createSequenceNode(
      command: SequenceNodeCommand,
      value: Value,
      serialOrName: SerialOrName,
      callback: CallbackWithErrorAndBody
    ): void;

    sendMultiSequenceCommand(
      serialOrName: SerialOrName,
      commands: MultiSequenceCommand[],
      sequenceType?: SequneceType | CallbackWithErrorAndBody,
      callback?: CallbackWithErrorAndBody
    ): void;

    sendSequenceCommand(
      serialOrName: SerialOrName,
      command: SequenceNodeCommand,
      value: Value,
      callback: CallbackWithErrorAndBody
    ): void;

    getAutomationRoutines(
      limit: number,
      callback: CallbackWithErrorAndBody
    ): void;

    executeAutomationRoutine(
      serialOrName: SerialOrName,
      routine: string,
      callback: CallbackWithErrorAndBody
    ): void;

    getMusicProviders(callback: CallbackWithErrorAndBody): void;

    playMusicProvider(
      serialOrName: SerialOrName,
      providerId: string,
      searchPhrase: string,
      callback: CallbackWithErrorAndBody
    ): void;

    sendTextMessage(
      conversationId: string,
      text: string,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteConversation(
      conversationId: string,
      callback: CallbackWithErrorAndBody
    ): void;

    setReminder(
      serialOrName: SerialOrName,
      timestamp: number,
      label: string,
      callback: CallbackWithErrorAndBody
    ): void;

    getHomeGroup(callback: CallbackWithErrorAndBody): void;

    getDevicePreferences(callback: CallbackWithErrorAndBody): void;

    getAllDeviceVolumes(callback: CallbackWithErrorAndBody): void;

    getSmarthomeDevices(callback: CallbackWithErrorAndBody): void;

    getSmarthomeGroups(callback: CallbackWithErrorAndBody): void;

    getSmarthomeEntities(callback: CallbackWithErrorAndBody): void;

    getSmarthomeBehaviourActionDefinitions(
      callback: CallbackWithErrorAndBody
    ): void;

    renameDevice(
      serialOrName: SerialOrName,
      newName: string,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteSmarthomeDevice(
      smarthomeDevice: string,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteSmarthomeGroup(
      smarthomeGroup: string,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteAllSmarthomeDevices(callback: CallbackWithErrorAndBody): void;

    discoverSmarthomeDevice(callback: CallbackWithErrorAndBody): void;

    querySmarthomeDevices(
      applicanceIds: string[],
      entityType: EntityType,
      callback: CallbackWithErrorAndBody
    ): void;

    executeSmarthomeDeviceAction(
      entityIds: string[],
      parameters: string[],
      entityType: EntityType,
      callback: CallbackWithErrorAndBody
    ): void;

    unpaireBluetooth(
      serialOrName: SerialOrName,
      btAddress: string,
      callback: CallbackWithErrorAndBody
    ): void;

    deleteDevice(
      serialOrName: SerialOrName,
      callback: CallbackWithErrorAndBody
    ): void;
  }
}
