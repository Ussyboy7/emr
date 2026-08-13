import { useCallback } from 'react';

type OrdersRef = {
  current: {
    setDiagnoses: (value: any) => void;
    setPrescriptions: (value: any) => void;
    setLabOrders: (value: any) => void;
    setNursingOrders: (value: any) => void;
    setRadiologyOrders: (value: any) => void;
    setPhysioOrders: (value: any) => void;
  } | null;
};

export function useConsultationRoomSessionCallbacks<T>({
  setSelectedSession,
  ordersRef,
}: {
  setSelectedSession: (session: T) => void;
  ordersRef: OrdersRef;
}) {
  const setSelectedSessionCallback = useCallback(
    (session: unknown) => setSelectedSession(session as T),
    [setSelectedSession],
  );
  const setDiagnoses = useCallback(
    (value: any) => ordersRef.current?.setDiagnoses(value),
    [ordersRef],
  );
  const setPrescriptions = useCallback(
    (value: any) => ordersRef.current?.setPrescriptions(value),
    [ordersRef],
  );
  const setLabOrders = useCallback(
    (value: any) => ordersRef.current?.setLabOrders(value),
    [ordersRef],
  );
  const setNursingOrders = useCallback(
    (value: any) => ordersRef.current?.setNursingOrders(value),
    [ordersRef],
  );
  const setRadiologyOrders = useCallback(
    (value: any) => ordersRef.current?.setRadiologyOrders(value),
    [ordersRef],
  );
  const setPhysioOrders = useCallback(
    (value: any) => ordersRef.current?.setPhysioOrders(value),
    [ordersRef],
  );

  return {
    setSelectedSession: setSelectedSessionCallback,
    setDiagnoses,
    setPrescriptions,
    setLabOrders,
    setNursingOrders,
    setRadiologyOrders,
    setPhysioOrders,
  };
}
