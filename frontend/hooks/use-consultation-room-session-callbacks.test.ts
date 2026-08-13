// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useConsultationRoomSessionCallbacks } from './use-consultation-room-session-callbacks';

describe('useConsultationRoomSessionCallbacks', () => {
  it('keeps the room-load dependency stable when session state changes', () => {
    const setSelectedSession = vi.fn();
    const ordersRef = {
      current: {
        setDiagnoses: vi.fn(),
        setPrescriptions: vi.fn(),
        setLabOrders: vi.fn(),
        setNursingOrders: vi.fn(),
        setRadiologyOrders: vi.fn(),
        setPhysioOrders: vi.fn(),
      },
    };

    const { result } = renderHook(() => {
      const [stateVersion, setStateVersion] = useState(0);
      const callbacks = useConsultationRoomSessionCallbacks({
        setSelectedSession,
        ordersRef,
      });
      const [roomLoadCount, setRoomLoadCount] = useState(0);

      useEffect(() => {
        setRoomLoadCount((count) => count + 1);
      }, [
        callbacks.setSelectedSession,
        callbacks.setDiagnoses,
        callbacks.setPrescriptions,
        callbacks.setLabOrders,
        callbacks.setNursingOrders,
        callbacks.setRadiologyOrders,
        callbacks.setPhysioOrders,
      ]);

      return { callbacks, roomLoadCount, setStateVersion, stateVersion };
    });

    expect(result.current.roomLoadCount).toBe(1);

    act(() => {
      result.current.setStateVersion((version) => version + 1);
    });

    expect(result.current.stateVersion).toBe(1);
    expect(result.current.roomLoadCount).toBe(1);
  });
});
